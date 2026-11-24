import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Backdrop } from './Backdrop';
import { Button } from './Button';
import { Modal } from './Modal';

describe('Modal', () => {
  it('es un diálogo accesible: foco inicial, Tab atrapado, Escape y clic fuera cierran', async () => {
    const onClose = jest.fn();
    const user = userEvent.setup();
    render(
      <>
        <button>afuera</button>
        <Modal title="Título" onClose={onClose}>
          <input aria-label="primero" />
          <button>último</button>
        </Modal>
      </>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Título' });
    expect(dialog).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');

    screen.getByRole('button', { name: 'último' }).focus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Cerrar' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'último' })).toHaveFocus();
    await user.keyboard('{a}');

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.mouseDown(dialog.parentElement!);
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.mouseDown(dialog);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('Tab sin elementos enfocables no rompe', async () => {
    const user = userEvent.setup();
    render(
      <Backdrop title="Vacío">
        <p>texto</p>
      </Backdrop>,
    );
    await user.tab();
    await user.keyboard('{Escape}');
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement!);
    expect(screen.getByRole('dialog', { name: 'Vacío' })).toBeInTheDocument();
  });
});

describe('Backdrop', () => {
  it('muestra subtítulo y botón de cierre solo si es descartable', () => {
    const onClose = jest.fn();
    const { rerender } = render(
      <Backdrop title="Resumen" subtitle="Revisa" onClose={onClose}>
        contenido
      </Backdrop>,
    );
    expect(screen.getByText('Revisa')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar resumen' }));
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement!);
    expect(onClose).toHaveBeenCalledTimes(2);
    rerender(<Backdrop title="Resumen">contenido</Backdrop>);
    expect(screen.queryByRole('button', { name: 'Cerrar resumen' })).not.toBeInTheDocument();
  });
});

describe('Button', () => {
  it('en carga se deshabilita y anuncia el estado', () => {
    render(
      <Button loading variant="secondary">
        Pagar
      </Button>,
    );
    const button = screen.getByRole('button', { name: /Pagar/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });
});
