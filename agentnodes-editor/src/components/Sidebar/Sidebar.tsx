import React, { useState } from 'react';
import styles from './Sidebar.module.css';

interface SidebarItem {
  id: string;
  name: string;
  icon?: string;
  description?: string;
}

interface SidebarCategory {
  id: string;
  name: string;
  items: SidebarItem[];
  expanded: boolean;
}

const initialCategories: SidebarCategory[] = [
  {
    id: 'input-nodes',
    name: 'Input Nodes',
    expanded: true,
    items: [
      { id: 'text-input', name: 'Text Input', icon: '📝', description: 'Accept text input from user' },
      { id: 'file-input', name: 'File Input', icon: '📁', description: 'Load files from system' },
      { id: 'api-input', name: 'API Input', icon: '🌐', description: 'Fetch data from external APIs' },
    ],
  },
  {
    id: 'processing-nodes',
    name: 'Processing Nodes',
    expanded: true,
    items: [
      { id: 'transform', name: 'Transform', icon: '⚡', description: 'Transform data structure' },
      { id: 'filter', name: 'Filter', icon: '🔍', description: 'Filter data based on criteria' },
      { id: 'merge', name: 'Merge', icon: '🔗', description: 'Combine multiple data sources' },
      { id: 'analyze', name: 'Analyze', icon: '📊', description: 'Perform data analysis' },
    ],
  },
  {
    id: 'output-nodes',
    name: 'Output Nodes',
    expanded: false,
    items: [
      { id: 'display', name: 'Display', icon: '📺', description: 'Show results to user' },
      { id: 'export', name: 'Export', icon: '📤', description: 'Export data to file' },
      { id: 'webhook', name: 'Webhook', icon: '🔔', description: 'Send data via webhook' },
    ],
  },
  {
    id: 'tools',
    name: 'Tools',
    expanded: false,
    items: [
      { id: 'debugger', name: 'Debugger', icon: '🐛', description: 'Debug node execution' },
      { id: 'logger', name: 'Logger', icon: '📋', description: 'Log execution steps' },
      { id: 'timer', name: 'Timer', icon: '⏱️', description: 'Measure execution time' },
    ],
  },
];

const Sidebar: React.FC = () => {
  const [categories, setCategories] = useState<SidebarCategory[]>(initialCategories);

  const toggleCategory = (categoryId: string) => {
    setCategories(prev =>
      prev.map(category =>
        category.id === categoryId
          ? { ...category, expanded: !category.expanded }
          : category
      )
    );
  };

  const handleItemClick = (item: SidebarItem) => {
    console.log('Item clicked:', item);
  };

  const onDragStart = (event: React.DragEvent, item: SidebarItem, categoryId: string) => {
    const dragData = {
      type: item.id,
      label: item.name,
      icon: item.icon || '',
      description: item.description || '',
      category: categoryId,
    };
    
    event.dataTransfer.setData('application/reactflow', JSON.stringify(dragData));
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className={styles.sidebar}>
      <div className={styles.sidebarContent}>
        {categories.map(category => (
          <div key={category.id} className={styles.category}>
            <button
              className={styles.categoryHeader}
              onClick={() => toggleCategory(category.id)}
              aria-expanded={category.expanded}
            >
              <span className={styles.categoryIcon}>
                {category.expanded ? '▼' : '▶'}
              </span>
              <span className={styles.categoryName}>{category.name}</span>
            </button>
            
            {category.expanded && (
              <div className={styles.itemList}>
                {category.items.map(item => (
                  <div
                    key={item.id}
                    className={styles.item}
                    onClick={() => handleItemClick(item)}
                    role="button"
                    tabIndex={0}
                    draggable
                    onDragStart={(event) => onDragStart(event, item, category.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        handleItemClick(item);
                      }
                    }}
                  >
                    {item.icon && (
                      <span className={styles.itemIcon}>{item.icon}</span>
                    )}
                    <div className={styles.itemContent}>
                      <div className={styles.itemName}>{item.name}</div>
                      {item.description && (
                        <div className={styles.itemDescription}>{item.description}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Sidebar;