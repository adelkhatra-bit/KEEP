import { useState, useCallback } from 'react';

/**
 * Hook universel pour gérer l'état des modales et éviter les conflits
 * (deux modales ouvertes simultanément).
 *
 * Utilisation :
 *   const { isOpen, open, close, reset } = useModalState();
 *   <Modal visible={isOpen('menu')} onRequestClose={() => close('menu')} />
 *   <Button onPress={() => open('menu', true)} /> // true = fermer les autres
 */

export const useModalState = () => {
  const [openModalIds, setOpenModalIds] = useState<Set<string>>(new Set());

  const isOpen = useCallback((id: string) => {
    return openModalIds.has(id);
  }, [openModalIds]);

  const open = useCallback((id: string, closeOthers = true) => {
    setOpenModalIds((prev) => {
      if (closeOthers) {
        return new Set([id]);
      }
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const close = useCallback((id: string) => {
    setOpenModalIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setOpenModalIds(new Set());
  }, []);

  return {
    isOpen,
    open,
    close,
    reset,
    openModalIds,
  };
};
