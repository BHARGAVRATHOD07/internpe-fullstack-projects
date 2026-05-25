/* ==========================================================================
   PREMIUM CALCULATOR JS CORE ENGINE
   Features: Precision Arithmetic, Audio Feedback, Theme Swapping, History, Keyboard Sync
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // DOM Element Selections
    const exprDisplay = document.getElementById('expr-display');
    const currentDisplay = document.getElementById('current-display');
    const activeCursor = document.querySelector('.active-cursor');
    const historySidebar = document.getElementById('history-sidebar');
    const historyList = document.getElementById('history-list');
    
    // Control Buttons
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const soundToggleBtn = document.getElementById('sound-toggle-btn');
    const historyToggleBtn = document.getElementById('history-toggle-btn');
    const historyCloseBtn = document.getElementById('history-close-btn');
    const clearHistoryBtn = document.getElementById('clear-history-btn');
    const keyButtons = document.querySelectorAll('.key-btn');

    // Calculator Core State
    let currentInput = '0';
    let previousResult = null;
    let pendingOperator = null; // 'add', 'subtract', 'multiply', 'divide'
    let expressionString = ''; // Shows running formula
    let shouldResetCurrent = false; // Overwrite currentInput on next number entry
    let isSoundEnabled = localStorage.getItem('soundEnabled') !== 'false';
    let calculationHistory = JSON.parse(localStorage.getItem('calcHistory')) || [];

    // Web Audio Context for click sounds (initialized lazily)
    let audioCtx = null;

    // Symbol Mapping for displaying pretty operators
    const operatorSymbols = {
        'add': '+',
        'subtract': '−',
        'multiply': '×',
        'divide': '÷'
    };

    /* ==========================================================================
       1. SYNTHETIC AUDIO FEEDBACK (Web Audio API)
       ========================================================================== */
    function initAudio() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    function playClickSound() {
        if (!isSoundEnabled) return;
        try {
            initAudio();
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }

            // Create nodes
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            
            // Set sound character (high-frequency short click)
            osc.type = 'triangle'; // Smooth, organic click
            osc.frequency.setValueAtTime(1000, audioCtx.currentTime); // Start at 1000Hz
            osc.frequency.exponentialRampToValueAtTime(150, audioCtx.currentTime + 0.05); // Sweep down
            
            // Volume Envelope
            gain.gain.setValueAtTime(0.08, audioCtx.currentTime); // Quiet click
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05); // Fast decay
            
            // Play & Stop
            osc.start(audioCtx.currentTime);
            osc.stop(audioCtx.currentTime + 0.06);
        } catch (e) {
            console.warn('Audio Context error: ', e);
        }
    }

    // Toggle sound setting
    soundToggleBtn.addEventListener('click', () => {
        isSoundEnabled = !isSoundEnabled;
        localStorage.setItem('soundEnabled', isSoundEnabled);
        updateSoundButtonUI();
        playClickSound();
    });

    function updateSoundButtonUI() {
        const icon = soundToggleBtn.querySelector('i');
        if (isSoundEnabled) {
            icon.className = 'fa-solid fa-volume-high';
            soundToggleBtn.classList.remove('active-indicator');
        } else {
            icon.className = 'fa-solid fa-volume-xmark';
            soundToggleBtn.classList.add('active-indicator');
        }
    }
    updateSoundButtonUI(); // Set initial icon state

    /* ==========================================================================
       2. DESIGN THEME SYSTEM (Dark / Light)
       ========================================================================== */
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeToggleUI(savedTheme);

    themeToggleBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeToggleUI(newTheme);
        playClickSound();
    });

    function updateThemeToggleUI(theme) {
        const icon = themeToggleBtn.querySelector('i');
        if (theme === 'dark') {
            icon.className = 'fa-solid fa-moon';
        } else {
            icon.className = 'fa-solid fa-sun';
        }
    }

    /* ==========================================================================
       3. KEYBOARD EVENT LISTENER & RIPPLE EFFECT
       ========================================================================== */
    // Dynamic CSS Ripple Effect on click
    function createRipple(event, button) {
        const circle = document.createElement('span');
        const diameter = Math.max(button.clientWidth, button.clientHeight);
        const radius = diameter / 2;

        circle.style.width = circle.style.height = `${diameter}px`;
        
        const rect = button.getBoundingClientRect();
        
        // Handle physical click vs keyboard triggered click
        if (event && event.clientX) {
            circle.style.left = `${event.clientX - rect.left - radius}px`;
            circle.style.top = `${event.clientY - rect.top - radius}px`;
        } else {
            // Centered ripple for keyboard triggers
            circle.style.left = `${button.clientWidth / 2 - radius}px`;
            circle.style.top = `${button.clientHeight / 2 - radius}px`;
        }

        circle.classList.add('ripple');
        
        // Remove existing ripples to avoid clutter
        const ripple = button.querySelector('.ripple');
        if (ripple) {
            ripple.remove();
        }

        button.appendChild(circle);
    }

    // Keyboard support event mapping
    window.addEventListener('keydown', (e) => {
        let keyChar = e.key;
        let matchedBtn = null;

        // Route special control keys
        if (keyChar === 'Escape') {
            matchedBtn = document.querySelector('[data-key="clear"]');
        } else if (keyChar === 'Backspace') {
            matchedBtn = document.querySelector('[data-key="backspace"]');
        } else if (keyChar === 'Enter' || keyChar === '=') {
            e.preventDefault();
            matchedBtn = document.querySelector('.equals-btn');
        } else if (keyChar === 'q' || keyChar === 'Q') {
            matchedBtn = document.querySelector('[data-func="square"]');
        } else if (keyChar === 'r' || keyChar === 'R') {
            matchedBtn = document.querySelector('[data-func="sqrt"]');
        } else if (keyChar === 'i' || keyChar === 'I') {
            matchedBtn = document.querySelector('[data-func="invert"]');
        } else if (keyChar === 'n' || keyChar === 'N') {
            matchedBtn = document.querySelector('[data-func="negate"]');
        } else if (keyChar === '%') {
            matchedBtn = document.querySelector('[data-func="percent"]');
        } else {
            // Direct attribute lookup for standard operators and numbers
            matchedBtn = document.querySelector(`[data-val="${keyChar}"]`) || 
                         document.querySelector(`[data-key="${keyChar}"]`);
        }

        if (matchedBtn) {
            // Visual click feedback
            matchedBtn.classList.add('key-pressed');
            createRipple(null, matchedBtn);
            playClickSound();
            
            // Execute the key code
            handleKeyPress(matchedBtn);
            
            // Remove active visual class after delay
            setTimeout(() => {
                matchedBtn.classList.remove('key-pressed');
            }, 100);
        }
    });

    // Wire up touch/click triggers for all buttons
    keyButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            createRipple(e, button);
            playClickSound();
            handleKeyPress(button);
        });
    });

    /* ==========================================================================
       4. CALCULATOR ENGINE LOGIC
       ========================================================================== */
    function handleKeyPress(button) {
        // 1. Number click
        if (button.classList.contains('num-btn')) {
            const value = button.getAttribute('data-val');
            inputDigit(value);
        }
        // 2. Operator click (+, -, *, /)
        else if (button.classList.contains('operator-btn')) {
            const operator = button.getAttribute('data-operator');
            inputOperator(operator);
        }
        // 3. Equals click (=)
        else if (button.classList.contains('equals-btn')) {
            inputEquals();
        }
        // 4. Advanced functions (sqrt, square, negate, percent, invert)
        else if (button.classList.contains('func-btn')) {
            const func = button.getAttribute('data-func');
            applyFunction(func);
        }
        // 5. Special actions (C, CE, Backspace)
        else if (button.classList.contains('action-btn')) {
            const action = button.getAttribute('data-key');
            applyAction(action);
        }
        
        // Sync layout display
        updateDisplay();
    }

    // Append standard digit to display
    function inputDigit(digit) {
        if (currentInput === '0' || shouldResetCurrent) {
            if (digit === '.') {
                currentInput = '0.';
            } else {
                currentInput = digit;
            }
            shouldResetCurrent = false;
        } else {
            // Guard against multiple dots in decimal entries
            if (digit === '.' && currentInput.includes('.')) return;
            // Prevent display overflow limit (max 16 characters)
            if (currentInput.length >= 16) return;
            currentInput += digit;
        }
    }

    // Set arithmetic operator
    function inputOperator(operator) {
        const inputNum = parseFloat(currentInput);

        if (pendingOperator && !shouldResetCurrent) {
            // Intermediate calculation if user chains operations (e.g. 2 + 3 * 5)
            const result = calculate(previousResult, inputNum, pendingOperator);
            previousResult = result;
            currentInput = String(formatResult(result));
        } else {
            previousResult = inputNum;
        }

        pendingOperator = operator;
        shouldResetCurrent = true;
        
        // Build pretty rolling history display string
        expressionString = `${formatDisplayNum(previousResult)} ${operatorSymbols[operator]}`;
    }

    // Compute the result of the calculation
    function inputEquals() {
        if (!pendingOperator) return;

        const inputNum = parseFloat(currentInput);
        const result = calculate(previousResult, inputNum, pendingOperator);

        // Store formula before resetting state
        const fullFormula = `${expressionString} ${formatDisplayNum(inputNum)}`;
        const formattedResult = formatResult(result);

        // Push successful operations to History drawer
        saveToHistory(fullFormula, String(formattedResult));

        currentInput = String(formattedResult);
        previousResult = null;
        pendingOperator = null;
        expressionString = '';
        shouldResetCurrent = true;
    }

    // Perform high-precision floating operations
    function calculate(n1, n2, op) {
        let result = 0;
        switch (op) {
            case 'add':
                result = n1 + n2;
                break;
            case 'subtract':
                result = n1 - n2;
                break;
            case 'multiply':
                result = n1 * n2;
                break;
            case 'divide':
                if (n2 === 0) {
                    return 'Error: Division by 0';
                }
                result = n1 / n2;
                break;
        }
        return result;
    }

    // Round calculations to fix standard IEEE-754 precision gaps
    function formatResult(num) {
        if (typeof num === 'string') return num;
        if (isNaN(num)) return 'Error';
        if (!isFinite(num)) return 'Error';
        
        // Standardize output to prevent floating artifacts (e.g. 0.1+0.2=0.30000000000000004)
        // We use 12 digit precision which captures full float details while rounding junk values
        let formatted = parseFloat(Number(num).toPrecision(12));
        
        // Switch to scientific notation if numbers are outrageously large
        if (Math.abs(formatted) > 1e15) {
            return num.toExponential(6);
        }
        return formatted;
    }

    // Advanced mathematical operations (Square, square root, invert, negation, percentage)
    function applyFunction(func) {
        let val = parseFloat(currentInput);
        if (isNaN(val)) return;

        switch (func) {
            case 'square':
                expressionString = `sqr(${formatDisplayNum(val)})`;
                val = val * val;
                break;
            case 'sqrt':
                if (val < 0) {
                    currentInput = 'Error: Invalid Input';
                    shouldResetCurrent = true;
                    expressionString = `√(${formatDisplayNum(val)})`;
                    return;
                }
                expressionString = `√(${formatDisplayNum(val)})`;
                val = Math.sqrt(val);
                break;
            case 'percent':
                // Behaves as a division by 100 on the current entry
                val = val / 100;
                break;
            case 'invert':
                if (val === 0) {
                    currentInput = 'Error: Division by 0';
                    shouldResetCurrent = true;
                    expressionString = `1/(${formatDisplayNum(val)})`;
                    return;
                }
                expressionString = `1/(${formatDisplayNum(val)})`;
                val = 1 / val;
                break;
            case 'negate':
                val = -val;
                break;
        }

        currentInput = String(formatResult(val));
        shouldResetCurrent = true;
    }

    // Standard control action triggers (C, CE, Backspace)
    function applyAction(action) {
        switch (action) {
            case 'clear':
                // Reset all states
                currentInput = '0';
                previousResult = null;
                pendingOperator = null;
                expressionString = '';
                shouldResetCurrent = false;
                break;
            case 'clear-entry':
                // Reset active screen entry only
                currentInput = '0';
                break;
            case 'backspace':
                // Delete last character
                if (shouldResetCurrent) {
                    expressionString = '';
                } else if (currentInput.length > 1) {
                    currentInput = currentInput.slice(0, -1);
                } else {
                    currentInput = '0';
                }
                break;
        }
    }

    // Format display string with commas for standard readability
    function formatDisplayNum(num) {
        if (typeof num === 'string' && num.includes('Error')) return num;
        
        const parts = String(num).split('.');
        const integerPart = parts[0];
        const decimalPart = parts.length > 1 ? '.' + parts[1] : '';
        
        // Add thousands separator to integer part
        const formattedInt = parseFloat(integerPart).toLocaleString('en-US', {
            maximumFractionDigits: 0
        });

        // If parseFloat fails (e.g. on empty or special values), fall back
        if (formattedInt === 'NaN') return String(num);
        
        return formattedInt + decimalPart;
    }

    // Refresh displays in UI
    function updateDisplay() {
        // 1. Set current output text
        if (currentInput.includes('Error')) {
            currentDisplay.textContent = currentInput;
            currentDisplay.style.fontSize = '1.6rem'; // Shrink size for error messages
        } else {
            currentDisplay.textContent = formatDisplayNum(currentInput);
            currentDisplay.style.fontSize = currentInput.length > 10 ? '1.7rem' : '2.3rem'; // Adjust dynamically based on count
        }

        // 2. Set upper rolling track
        exprDisplay.textContent = expressionString;

        // Auto-scroll display to the right to see ongoing inputs
        currentDisplay.scrollLeft = currentDisplay.scrollWidth;
        exprDisplay.scrollLeft = exprDisplay.scrollWidth;
    }

    /* ==========================================================================
       5. PERSISTENT HISTORY DRAWER
       ========================================================================== */
    // Open history sidebar drawer
    historyToggleBtn.addEventListener('click', () => {
        historySidebar.classList.add('open');
        renderHistoryList();
        playClickSound();
    });

    // Close drawer
    historyCloseBtn.addEventListener('click', () => {
        historySidebar.classList.remove('open');
        playClickSound();
    });

    // Clear history logs
    clearHistoryBtn.addEventListener('click', () => {
        calculationHistory = [];
        localStorage.removeItem('calcHistory');
        renderHistoryList();
        playClickSound();
    });

    // Save item in arrays and cache in device
    function saveToHistory(expr, result) {
        if (result.includes('Error')) return; // Don't log operations that errored out
        
        const item = { expr, result };
        calculationHistory.unshift(item); // Prepend to show most recent first
        
        // Limit history list to 50 items max
        if (calculationHistory.length > 50) {
            calculationHistory.pop();
        }
        
        localStorage.setItem('calcHistory', JSON.stringify(calculationHistory));
    }

    // Render HTML logs in history panel
    function renderHistoryList() {
        historyList.innerHTML = '';
        
        if (calculationHistory.length === 0) {
            historyList.innerHTML = '<div class="no-history">No history yet</div>';
            return;
        }

        calculationHistory.forEach((item, index) => {
            const element = document.createElement('div');
            element.className = 'history-item';
            element.innerHTML = `
                <div class="history-item-expression">${item.expr} =</div>
                <div class="history-item-result">${formatDisplayNum(item.result)}</div>
            `;
            
            // Allow user to click a history log and load the result back
            element.addEventListener('click', () => {
                currentInput = String(item.result);
                expressionString = '';
                pendingOperator = null;
                previousResult = null;
                shouldResetCurrent = true;
                
                updateDisplay();
                historySidebar.classList.remove('open');
                playClickSound();
            });

            historyList.appendChild(element);
        });
    }

    // Initial render
    updateDisplay();
});
