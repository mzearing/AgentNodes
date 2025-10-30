import React, { useState, useRef, useEffect, useMemo } from 'react';
import styles from './TypeDropdown.module.css';

// --- Type Definitions ---
export interface DropdownOption {
  value: string;
  label: string;
  color: string;
  bgColor: string;
  textColor: string;
}

interface TypeDropdownProps {
  options: DropdownOption[];
  defaultOption?: DropdownOption;
  value?: DropdownOption;
  onChange?: (option: DropdownOption) => void;
  isLocked?: boolean;
}



// --- Main Dropdown Component ---
const TypeDropdown: React.FC<TypeDropdownProps> = ({
  options,
  defaultOption,
  value,
  onChange,
  isLocked = false,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const selectedOption = useMemo(() => {
    return value || defaultOption || options[0];
  }, [value, defaultOption, options]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // If the component becomes locked while open, close it.
    if (isLocked) {
      setIsOpen(false);
    }
  }, [isLocked]);


  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleHeaderClick = () => {
    // Only allow opening if it's not locked
    if (!isLocked) {
      setIsOpen((prev) => !prev);
    }
  };
  
  const handleOptionClick = (option: DropdownOption) => {
    setIsOpen(false);
    if (onChange) {
      onChange(option);
    }
  };

  const headerStyles: React.CSSProperties = {
    backgroundColor: selectedOption.bgColor,
    color: selectedOption.textColor,
  };

  return (
    <div className={styles.dropdownContainer} ref={dropdownRef}>
      <div
        className={`${styles.dropdownHeader} ${isLocked ? styles.locked : ''}`}
        style={headerStyles}
        onClick={handleHeaderClick}
        role={!isLocked ? 'button' : undefined}
        aria-haspopup={!isLocked ? 'listbox' : undefined}
        aria-expanded={!isLocked ? isOpen : undefined}
      >
        <span className={styles.dropdownSelectedLabel}>{selectedOption.label}</span>
        {!isLocked && <span className={styles.dropdownIcon}>▼</span>}
      </div>
      <div className={`${styles.dropdownListContainer} ${isOpen ? styles.open : ''}`}>
        <ul className={styles.dropdownList} role="listbox">
          {options.map((option) => (
            <li
              key={option.value}
              className={styles.dropdownItem}
              onClick={() => handleOptionClick(option)}
              role="option"
              aria-selected={selectedOption.value === option.value}
            >
              <span
                className={styles.colorBand}
                style={{ backgroundColor: option.color }}
              ></span>
              {option.value}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default TypeDropdown;