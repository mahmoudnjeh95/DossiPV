import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Icon } from '../src/Icon';

describe('Icon component', () => {
  it('renders an svg element', () => {
    const { container } = render(<Icon />);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('applies correct size for xs', () => {
    const { container } = render(<Icon size="xs" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('16');
    expect(svg?.getAttribute('height')).toBe('16');
  });

  it('applies correct size for xl', () => {
    const { container } = render(<Icon size="xl" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('48');
    expect(svg?.getAttribute('height')).toBe('48');
  });

  it('uses currentColor by default', () => {
    const { container } = render(<Icon />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('stroke')).toBe('currentColor');
  });

  it('applies gold color', () => {
    const { container } = render(<Icon color="gold" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('stroke')).toBe('#FFA500');
  });
});
