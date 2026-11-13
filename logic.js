// =============================================================
// Payinnov · Les règles du paiement, sans interface
// -------------------------------------------------------------
// Ce fichier ne touche ni à la page ni au wallet. Il contient :
//   - les réglages de chaque réseau (testnet, réseau principal) ;
//   - la façon d'écrire un montant pour le registre ;
//   - la vérification "ce paiement est-il bien le bon ?".
// Il est testé à part : npm test
// =============================================================

import { xrpToDrops, dropsToXrp } from 'xrpl';

// RLUSD a un nom de plus de 3 lettres. Le registre l'écrit donc
// en hexadécimal, sur 40 caractères. C'est la valeur officielle de Ripple.
export const RLUSD_HEX = '524C555344000000000000000000000000000000';

// Un réseau = une adresse de serveur, un explorateur, et l'émetteur de RLUSD.
// L'émetteur n'est pas le même sur le testnet et sur le réseau principal.
export const NETWORKS = {
  testnet: {
    label: 'XRPL testnet',
    real: false, // argent fictif
    url: 'wss://s.altnet.rippletest.net:51233',
    explorer: 'https://testnet.xrpl.org/transactions/',
    rlusdIssuer: 'rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV',
    rlusdFaucet: 'https://tryrlusd.com/',
  },
  mainnet: {
    label: 'XRPL réseau principal',
    real: true, // argent réel
    url: 'wss://xrplcluster.com',
    explorer: 'https://livenet.xrpl.org/transactions/',
    rlusdIssuer: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De',
    rlusdFaucet: null,
  },
};

// Nombre de décimales acceptées à la saisie.
export const CURRENCIES = {
  XRP: { label: 'XRP', decimals: 6, step: '0.01' },
  RLUSD: { label: 'RLUSD', decimals: 2, step: '0.01' },
};

// Lit le réseau choisi dans le fichier .env. Tout ce qui n'est pas
// exactement "mainnet" donne le testnet : on ne passe pas en réel par accident.
export function pickNetwork(value) {
  return value === 'mainnet' ? 'mainnet' : 'testnet';
}

// Écrit un montant comme le registre l'attend.
//   XRP   -> un texte en "drops" (1 XRP = 1 000 000 drops)
//   RLUSD -> un objet { currency, issuer, value }
export function toLedgerAmount(currency, value, networkKey) {
  const amount = Number(value);
  if (!(amount > 0)) throw new Error('Montant invalide.');
  if (currency === 'XRP') {
    return xrpToDrops(amount.toFixed(CURRENCIES.XRP.decimals));
  }
  if (currency === 'RLUSD') {
    return {
      currency: RLUSD_HEX,
      issuer: NETWORKS[networkKey].rlusdIssuer,
      value: String(Number(amount.toFixed(CURRENCIES.RLUSD.decimals))),
    };
  }
  throw new Error(`Devise inconnue : ${currency}`);
}

// Compare le montant réellement reçu (lu sur le registre) au montant attendu.
export function sameAmount(delivered, expected) {
  if (typeof expected === 'string') {
    return delivered === expected; // XRP : deux textes en drops
  }
  return (
    typeof delivered === 'object' && delivered !== null &&
    delivered.currency === expected.currency && // la bonne devise
    delivered.issuer === expected.issuer &&     // le bon émetteur : pas un faux RLUSD
    Number(delivered.value) === Number(expected.value)
  );
}

// Une transaction lue chez le marchand est-elle le paiement de cette commande ?
// On vérifie six points. Un seul faux, et ce n'est pas le bon paiement.
export function isPaymentFor(entry, { merchant, payer, orderId, expected }) {
  const tx = entry.tx_json ?? entry.tx;
  const meta = entry.meta;
  return Boolean(
    entry.validated &&                          // 1. inscrite sur le registre
    tx?.TransactionType === 'Payment' &&
    tx.Destination === merchant &&              // 2. vers le bon marchand
    tx.DestinationTag === orderId &&            // 3. pour la bonne commande
    tx.Account === payer &&                     // 4. par le bon client
    meta?.TransactionResult === 'tesSUCCESS' && // 5. réussie
    sameAmount(meta.delivered_amount, expected) // 6. au bon montant, réellement reçu
  );
}

// Cherche la ligne de confiance RLUSD dans la réponse "account_lines".
// Sans cette ligne, un compte ne peut ni recevoir ni détenir de RLUSD.
export function findRlusdLine(lines, networkKey) {
  const issuer = NETWORKS[networkKey].rlusdIssuer;
  return (lines ?? []).find((line) => line.currency === RLUSD_HEX && line.account === issuer) ?? null;
}

// La transaction qui ouvre une ligne de confiance RLUSD.
export function trustSetFor(account, networkKey) {
  return {
    TransactionType: 'TrustSet',
    Account: account,
    LimitAmount: {
      currency: RLUSD_HEX,
      issuer: NETWORKS[networkKey].rlusdIssuer,
      value: '1000000', // plafond de détention accepté
    },
    Flags: 131072, // tfSetNoRipple, recommandé par Ripple
  };
}

// Affiche un montant lu sur le registre : "10 XRP" ou "10 RLUSD".
export function formatDelivered(delivered) {
  if (typeof delivered === 'string') return `${dropsToXrp(delivered)} XRP`;
  return `${delivered.value} RLUSD`;
}
