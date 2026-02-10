import { useEffect, useCallback } from 'react';

export interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  callback: (event: KeyboardEvent) => void;
}

interface KeyboardShortcutOptions {
  preventDefault?: boolean;
  stopPropagation?: boolean;
  ignoreInputs?: boolean;
}

const DEFAULT_OPTIONS: KeyboardShortcutOptions = {
  preventDefault: true,
  stopPropagation: true,
  ignoreInputs: true
};

/**
 * Cross-platform keyboard shortcut hook
 * Automatically handles Ctrl (Windows/Linux) vs Cmd (macOS) modifiers
 */
export const useKeyboardShortcuts = (
  shortcuts: KeyboardShortcut[],
  options: KeyboardShortcutOptions = {}
) => {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Skip if we're in an input field and ignoreInputs is true
    if (opts.ignoreInputs) {
      const target = event.target as HTMLElement;
      const tagName = target.tagName.toLowerCase();
      const isContentEditable = target.contentEditable === 'true';
      
      if (
        tagName === 'input' ||
        tagName === 'textarea' ||
        tagName === 'select' ||
        isContentEditable
      ) {
        return;
      }
    }

    // Check each shortcut
    for (const shortcut of shortcuts) {
      if (isShortcutMatch(event, shortcut)) {
        if (opts.preventDefault) {
          event.preventDefault();
        }
        if (opts.stopPropagation) {
          event.stopPropagation();
        }
        
        shortcut.callback(event);
        break;
      }
    }
  }, [shortcuts, opts]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
};

/**
 * Check if a keyboard event matches a shortcut definition
 */
const isShortcutMatch = (event: KeyboardEvent, shortcut: KeyboardShortcut): boolean => {
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  
  // Key must match (case insensitive)
  if (event.key.toLowerCase() !== shortcut.key.toLowerCase()) {
    return false;
  }

  // Handle cross-platform modifier keys
  const expectedCtrl = shortcut.ctrlKey || false;
  const expectedMeta = shortcut.metaKey || false;
  const expectedShift = shortcut.shiftKey || false;
  const expectedAlt = shortcut.altKey || false;

  // On Mac, treat ctrlKey requirement as metaKey requirement
  const actualCtrl = isMac ? event.metaKey : event.ctrlKey;
  const actualMeta = isMac ? event.ctrlKey : event.metaKey;

  // Check modifiers
  const ctrlMatches = expectedCtrl ? actualCtrl : !actualCtrl;
  const metaMatches = expectedMeta ? actualMeta : !actualMeta;
  const shiftMatches = expectedShift ? event.shiftKey : !event.shiftKey;
  const altMatches = expectedAlt ? event.altKey : !event.altKey;

  return ctrlMatches && metaMatches && shiftMatches && altMatches;
};

/**
 * Utility function to create cross-platform shortcuts
 */
export const createShortcut = (
  key: string,
  callback: (event: KeyboardEvent) => void,
  options: {
    ctrl?: boolean;
    shift?: boolean;
    alt?: boolean;
  } = {}
): KeyboardShortcut => {
  return {
    key,
    ctrlKey: options.ctrl || false,
    shiftKey: options.shift || false,
    altKey: options.alt || false,
    callback
  };
};

/**
 * Common shortcut patterns
 */
export const shortcuts = {
  copy: (callback: (event: KeyboardEvent) => void) => 
    createShortcut('c', callback, { ctrl: true }),
  
  paste: (callback: (event: KeyboardEvent) => void) => 
    createShortcut('v', callback, { ctrl: true }),
  
  undo: (callback: (event: KeyboardEvent) => void) => 
    createShortcut('z', callback, { ctrl: true }),
  
  redo: (callback: (event: KeyboardEvent) => void) => 
    createShortcut('y', callback, { ctrl: true }),
  
  redoAlt: (callback: (event: KeyboardEvent) => void) => 
    createShortcut('z', callback, { ctrl: true, shift: true }),
  
  selectAll: (callback: (event: KeyboardEvent) => void) => 
    createShortcut('a', callback, { ctrl: true }),
  
  delete: (callback: (event: KeyboardEvent) => void) => 
    createShortcut('Delete', callback),
  
  backspace: (callback: (event: KeyboardEvent) => void) => 
    createShortcut('Backspace', callback)
};