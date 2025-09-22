import { useEffect } from 'react';

export const useClickOutside = (callback: () => void) => {
  useEffect(() => {
    const handleClickOutside = () => {
      callback();
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [callback]);
};