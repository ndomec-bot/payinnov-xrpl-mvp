// =============================================================
// Payinnov · Activer RLUSD sur le compte marchand (TESTNET SEULEMENT)
// -------------------------------------------------------------
// Un compte XRPL ne peut recevoir du RLUSD que s'il a ouvert une
// "ligne de confiance" vers l'émetteur du RLUSD. Ce script l'ouvre
// pour le marchand. À lancer une seule fois : npm run trustline
//
// Il lit le secret du marchand dans le fichier .env.
// C'est acceptable sur le testnet, où l'argent est fictif.
// Sur le réseau principal, ce script refuse de tourner :
// un vrai secret ne s'écrit jamais dans un fichier.
// =============================================================

import { Client, Wallet } from 'xrpl';
import { NETWORKS, pickNetwork, findRlusdLine, trustSetFor } from '../logic.js';

const networkKey = pickNetwork(process.env.VITE_NETWORK);
if (networkKey === 'mainnet') {
  console.error('Refusé : ce script ne tourne que sur le testnet.');
  console.error('Sur le réseau principal, active RLUSD depuis Xaman, sur le compte marchand.');
  process.exit(1);
}

const address = process.env.VITE_MERCHANT_ADDRESS;
const secret = process.env.MERCHANT_SECRET;
if (!address || !secret) {
  console.error('Il manque VITE_MERCHANT_ADDRESS ou MERCHANT_SECRET dans le fichier .env.');
  process.exit(1);
}

// Le secret doit correspondre à l'adresse du marchand.
// Selon le faucet, la clé suit l'un ou l'autre de ces deux algorithmes.
function walletFor(seed, expectedAddress) {
  const tries = [undefined, { algorithm: 'ed25519' }, { algorithm: 'ecdsa-secp256k1' }];
  for (const options of tries) {
    try {
      const wallet = Wallet.fromSeed(seed, options);
      if (wallet.address === expectedAddress) return wallet;
    } catch { /* on essaie le suivant */ }
  }
  return null;
}

const wallet = walletFor(secret, address);
if (!wallet) {
  console.error('Le secret ne correspond pas à l’adresse du marchand. Vérifie les deux lignes du .env.');
  process.exit(1);
}

const net = NETWORKS[networkKey];
const client = new Client(net.url);
await client.connect();
try {
  const readLine = async () => {
    const { result } = await client.request({
      command: 'account_lines', account: address, peer: net.rlusdIssuer, ledger_index: 'validated',
    });
    return findRlusdLine(result.lines, networkKey);
  };

  if (await readLine()) {
    console.log('RLUSD est déjà activé sur le compte marchand. Rien à faire.');
  } else {
    console.log('Ouverture de la ligne de confiance RLUSD…');
    const response = await client.submitAndWait(trustSetFor(address, networkKey), { wallet, autofill: true });
    const outcome = response.result.meta?.TransactionResult;
    if (outcome !== 'tesSUCCESS') {
      console.error(`Échec : ${outcome}`);
      process.exit(1);
    }
    console.log('RLUSD activé sur le compte marchand.');
    console.log(`Transaction : ${net.explorer}${response.result.hash}`);
  }
} finally {
  await client.disconnect();
}
