import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TileErrorBoundary } from '../src/components/ErrorBoundary';

let shouldThrow = true;

function Boom() {
  if (shouldThrow) throw new Error('boom');
  return <span>recovered</span>;
}

describe('TileErrorBoundary', () => {
  it('recovers via Retry', async () => {
    const user = userEvent.setup();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    shouldThrow = true;

    render(
      <TileErrorBoundary title="Boom">
        <Boom />
      </TileErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Boom needs a refresh');
    shouldThrow = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(screen.getByText('recovered')).toBeInTheDocument();
    errorSpy.mockRestore();
  });

  it('clears when resetKey changes', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    shouldThrow = true;

    const { rerender } = render(
      <TileErrorBoundary title="Boom" resetKey="{}">
        <Boom />
      </TileErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();

    shouldThrow = false;
    rerender(
      <TileErrorBoundary title="Boom" resetKey='{"fixed":true}'>
        <Boom />
      </TileErrorBoundary>,
    );

    expect(screen.getByText('recovered')).toBeInTheDocument();
    errorSpy.mockRestore();
  });
});
