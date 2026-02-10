import { Node } from '@xyflow/react';

/**
 * Determines whether a connection should be strong (blocking) or weak (non-blocking)
 * based on the target node and connection details.
 * 
 * This is the single source of truth for connection strength determination,
 * used by both the compilation service and the canvas editor.
 * 
 * @param targetNode The node that the connection is targeting
 * @param targetHandle Optional target handle identifier
 * @returns true for strong connections (blocking), false for weak connections (non-blocking)
 */
export function determineConnectionStrength(targetNode: Node, targetHandle?: string): boolean {
  const nodeId = targetNode.data?.nodeId as string;
  
  // Variable setter nodes receive weak (non-triggering) connections
  if (nodeId?.startsWith('variable_set_')) {
    return false;
  }
  
  // All other connections are strong (blocking) by default
  return true;
}

/**
 * Determines the CSS class name for edge styling based on connection strength
 */
export function getConnectionStyleClass(isStrong: boolean): string {
  return isStrong ? 'strong-connection' : 'weak-connection';
}