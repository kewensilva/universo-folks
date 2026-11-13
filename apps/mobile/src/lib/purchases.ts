import { Platform } from 'react-native';
import type { PublicTierPrice } from '@folks/shared';

/**
 * Compra do Premium nas lojas (RevenueCat, decidido pelo cliente). O app chama `Purchases.logIn(<id do usuário>)`
 * e compra o produto da loja (appleProductId / googleProductId do preço); quem libera o acesso é o
 * webhook da RevenueCat na API, nunca o aparelho.
 *
 * Enquanto o SDK (react-native-purchases) e as chaves públicas da RevenueCat não estão configurados
 * (precisa de build de desenvolvimento, não roda no Expo Go), `available` é falso e a tela explica.
 */
export interface StorePurchases {
  available: boolean;
  /** por que não dá para comprar agora (mostrado na tela) */
  reason: string | null;
  productIdOf: (price: PublicTierPrice) => string | null;
  buy: (price: PublicTierPrice, userId: string) => Promise<void>;
  restore: (userId: string) => Promise<void>;
}

const NOT_READY = 'A assinatura pelas lojas (App Store e Google Play) é ativada na versão publicada do app. Por enquanto, o Premium pode ser liberado pela equipe Folks.';

export const storePurchases: StorePurchases = {
  available: false,
  reason: NOT_READY,
  productIdOf: (p) => (Platform.OS === 'ios' ? p.appleProductId : Platform.OS === 'android' ? p.googleProductId : null),
  buy: async () => { throw new Error(NOT_READY); },
  restore: async () => { throw new Error(NOT_READY); },
};
