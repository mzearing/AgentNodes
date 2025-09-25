import React from 'react';
import styles from './CategoryTabs.module.css';

type Category = 'Complex' | 'Atomic';

interface CategoryTabsProps {
  activeCategory: Category;
  onCategoryChange: (category: Category) => void;
}

const CategoryTabs: React.FC<CategoryTabsProps> = ({ activeCategory, onCategoryChange }) => {
  return (
    <div className={styles.categories}>
      <button
        className={`${styles.categoryButton} ${activeCategory === 'Complex' ? styles.active : ''}`}
        onClick={() => onCategoryChange('Complex')}
      >
        Complex
      </button>
      <button
        className={`${styles.categoryButton} ${activeCategory === 'Atomic' ? styles.active : ''}`}
        onClick={() => onCategoryChange('Atomic')}
      >
        Atomic
      </button>
    </div>
  );
};

export default CategoryTabs;