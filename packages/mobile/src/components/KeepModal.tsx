import React from 'react';
import { Modal, type ModalProps } from 'react-native';
import ModalAlertLayer from './ModalAlertLayer';

/**
 * Fenêtre Modal Loki (Adel, 05/10/2026) : identique à `Modal` de React Native, avec en plus la couche d'alerte (`ModalAlertLayer`) :
 * toute alerte `Alert.alert` déclenchée pendant que cette fenêtre est ouverte s'affiche PAR-DESSUS (sur iPhone, une Modal racine ne peut pas
 * s'ouvrir au-dessus d'une autre Modal : l'alerte apparaissait seulement après la fermeture de la fenêtre).
 * RÈGLE : ne jamais importer `Modal` de react-native dans un écran ou un composant ; utiliser ce composant (contrôlé par un test de contrat).
 */
export default function KeepModal({ children, ...props }: ModalProps) {
  return (
    <Modal {...props}>
      {children}
      <ModalAlertLayer />
    </Modal>
  );
}
