import { IOType } from '../types/project';

export interface TypeColorOption {
  value: string;
  label: string;
  color: string;
  bgColor: string;
  textColor: string;
}

// Single source of truth for type colors
export const allTypeOptions: TypeColorOption[] = [
  { value: 'None', label: 'N', color: '#4A5568', bgColor: '#4A5568', textColor: '#FFFFFF' },
  { value: 'Integer', label: 'I', color: '#BEE3F8', bgColor: '#BEE3F8', textColor: '#000000' },
  { value: 'Float', label: 'F', color: '#C6F6D5', bgColor: '#C6F6D5', textColor: '#000000' },
  { value: 'String', label: 'S', color: '#FF8C00', bgColor: '#FF8C00', textColor: '#FFFFFF' },
  { value: 'Boolean', label: 'B', color: '#E6E6FA', bgColor: '#E6E6FA', textColor: '#000000' },
  { value: 'Handle', label: 'H', color: '#808080', bgColor: '#808080', textColor: '#FFFFFF' },
  { value: 'Array', label: 'A', color: '#FFD700', bgColor: '#FFD700', textColor: '#000000' },
  { value: 'Byte', label: 'Y', color: '#8B4513', bgColor: '#8B4513', textColor: '#FFFFFF' },
  { value: 'Object', label: 'O', color: '#9370DB', bgColor: '#9370DB', textColor: '#FFFFFF' },
  { value: 'Agent', label: 'A', color: '#FF69B4', bgColor: '#FF69B4', textColor: '#FFFFFF' },
];

const typeNames = ['None', 'Integer', 'Float', 'String', 'Boolean', 'Handle', 'Array', 'Byte', 'Object', 'Agent'];

/**
 * Get the color for a specific IOType
 */
export function getTypeColor(type: IOType): string {
  const typeName = typeNames[type] || 'None';
  const typeOption = allTypeOptions.find(opt => opt.value === typeName) || allTypeOptions[0];
  return typeOption.color;
}

/**
 * Convert hex color to rgba
 */
export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}