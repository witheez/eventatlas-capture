/**
 * Toast notification component
 */
import { useEffect } from 'preact/hooks';

export interface ToastProps {
  message: string;
  type?: 'success' | 'error';
  visible: boolean;
  onHide: () => void;
}

export function Toast({
  message,
  type = 'success',
  visible,
  onHide,
}: ToastProps): preact.JSX.Element | null {
  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => {
        onHide();
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [visible, onHide]);

  const className = `toast ${visible ? 'visible' : ''} ${type}`;

  return <div class={className}>{message}</div>;
}
