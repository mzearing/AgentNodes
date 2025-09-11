import React from 'react';
import styles from './Header.module.css';

const Header: React.FC = () => {
  return (
    <div className={styles.header}>
      <h1 style={{margin: 0, padding: '20px'}}></h1>
    </div>
  );
};

export default Header;