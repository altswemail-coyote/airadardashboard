// =====================================================
// MISTRAL LE CHAT CONTENT SCRIPT - AUTO-INJECT PROMPTS
// =====================================================

(function() {
  'use strict';
  
  console.log('[COGNESION] Le Chat content script loaded');
  
  // Check for pending prompt on page load
  checkForPendingPrompt();
  
  async function checkForPendingPrompt() {
    try {
      const result = await chrome.storage.local.get(['pendingPrompt', 'pendingPromptTarget']);
      
      if (result.pendingPrompt && result.pendingPromptTarget === 'lechat') {
        console.log('[COGNESION] Found pending prompt for Le Chat');
        
        // Wait for input field (Le Chat likely uses textarea or contenteditable)
        waitForElement('textarea, [contenteditable="true"]', (inputField) => {
          injectPrompt(inputField, result.pendingPrompt);
          
          // Clear pending prompt
          chrome.storage.local.remove(['pendingPrompt', 'pendingPromptTarget']);
        });
      }
    } catch (error) {
      console.error('[COGNESION] Error checking for prompt:', error);
    }
  }
  
  function waitForElement(selector, callback, maxWait = 10000) {
    const startTime = Date.now();
    
    const checkInterval = setInterval(() => {
      const element = document.querySelector(selector);
      
      if (element) {
        clearInterval(checkInterval);
        callback(element);
      } else if (Date.now() - startTime > maxWait) {
        clearInterval(checkInterval);
        console.warn('[COGNESION] Timeout waiting for Le Chat input field');
      }
    }, 100);
  }
  
  function injectPrompt(inputField, prompt) {
    try {
      // Set focus
      inputField.focus();
      
      // Handle different input types
      if (inputField.tagName === 'TEXTAREA' || inputField.tagName === 'INPUT') {
        inputField.value = prompt;
        
        // Trigger events
        inputField.dispatchEvent(new Event('input', { bubbles: true }));
        inputField.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        // Contenteditable div
        inputField.innerText = prompt;
        
        // Trigger input event
        inputField.dispatchEvent(new Event('input', { bubbles: true }));
      }
      
      console.log('[COGNESION] Prompt injected into Le Chat');
      
      // Show success feedback
      showInjectionFeedback();
    } catch (error) {
      console.error('[COGNESION] Error injecting prompt:', error);
    }
  }
  
  function showInjectionFeedback() {
    const feedback = document.createElement('div');
    feedback.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: rgba(59, 130, 246, 0.95);
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      z-index: 100000;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    `;
    feedback.textContent = '✅ Cognesion prompt ready!';
    
    document.body.appendChild(feedback);
    
    setTimeout(() => {
      feedback.style.opacity = '0';
      feedback.style.transition = 'opacity 0.3s';
      setTimeout(() => feedback.remove(), 300);
    }, 3000);
  }
})();
