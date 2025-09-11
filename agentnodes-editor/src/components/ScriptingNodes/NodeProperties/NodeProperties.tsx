import React from 'react';
import styles from './NodeProperties.module.css';

interface NodePropertiesProps {
  properties?: Record<string, unknown>;
}

const NodeProperties: React.FC<NodePropertiesProps> = ({ properties = {} }) => {
  return (
    <div className={styles.nodeProperties}>
      {Object.keys(properties).length > 0 && (
        <div className={styles.propertiesList}>
          {Object.entries(properties).map(([key, value]) => (
            <div key={key} className={styles.property}>
              <span className={styles.propertyKey}>{key}:</span>
              <span className={styles.propertyValue}>{String(value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default NodeProperties;