// =============================================================
// Payinnov · MVP paiement XRP sur le XRP Ledger (testnet)
// -------------------------------------------------------------
// Le parcours, en 4 temps :
//   1. On crée une commande (montant + numéro de commande).
//   2. Le client connecte son wallet (Xaman, Crossmark, GemWallet).
//   3. Le client signe un paiement vers l'adresse du marchand.
//   4. On vérifie nous-mêmes, sur le registre, que le paiement est
//      validé, au bon montant, vers le bon marchand, pour la bonne commande.
// =============================================================

import { WalletManager, XamanAdapter, CrossmarkAdapter, GemWalletAdapter } from 'xrpl-connect';
import { Client, xrpToDrops, dropsToXrp } from 'xrpl';

// ---------- Configuration (fichier .env) ----------
const XAMAN_API_KEY = import.meta.env.VITE_XAMAN_API_KEY;
const MERCHANT_ADDRESS = import.meta.env.VITE_MERCHANT_ADDRESS;
const TESTNET_URL = 'wss://s.altnet.rippletest.net:51233';
const EXPLORER = 'https://testnet.xrpl.org/transactions/';

// ---------- Éléments de la page ----------
const $ = (id) => document.getElementById(id);
const amountInput = $('amount');
const connectBtn = $('connect-btn');
const payBtn = $('pay-btn');
const statusBox = $('status');

function showStatus(message, kind = 'info') {
  statusBox.className = `status ${kind}`;
  statusBox.innerHTML = message;
}

// ---------- 1. La commande ----------
// Le "destination tag" est un nombre attaché au paiement.
// C'est lui qui dit "ce paiement correspond à la commande n° X".
// En production, il viendra de la base de données Payinnov.
const orderId = Math.floor(100000 + Math.random() * 900000);
$('order-id').textContent = orderId;
$('merchant').textContent = MERCHANT_ADDRESS || '(non configuré)';

if (!XAMAN_API_KEY || !MERCHANT_ADDRESS) {
  showStatus('Configuration manquante : remplis le fichier <code>.env</code> (voir README).', 'error');
}

// ---------- 2. Connexion du wallet du client ----------
const walletManager = new WalletManager({
  adapters: [
    new XamanAdapter({ apiKey: XAMAN_API_KEY }),
    new CrossmarkAdapter(),
    new GemWalletAdapter(),
  ],
  network: 'testnet',
  autoConnect: true,
});

// On branche les écouteurs tout de suite (sinon on rate la reconnexion automatique).
walletManager.on('connect', (account) => {
  $('account').textContent = `Wallet connecté : ${account.address}`;
  connectBtn.textContent = 'Changer de wallet';
  payBtn.disabled = false;
});

walletManager.on('disconnect', () => {
  $('account').textContent = '';
  connectBtn.textContent = 'Connecter mon wallet';
  payBtn.disabled = true;
});

const connector = $('wallet-connector');
connector.setWalletManager(walletManager);
connectBtn.addEventListener('click', () => connector.open());

// ---------- 3. Paiement ----------
payBtn.addEventListener('click', async () => {
  const amountXrp = Number(amountInput.value);
  if (!(amountXrp > 0)) {
    showStatus('Montant invalide.', 'error');
    return;
  }

  // Le registre compte en "drops" : 1 XRP = 1 000 000 drops.
  const amountDrops = xrpToDrops(amountXrp);

  const payment = {
    TransactionType: 'Payment',
    Account: walletManager.account.address, // le client
    Destination: MERCHANT_ADDRESS,          // le marchand
    Amount: amountDrops,
    DestinationTag: orderId,                // la commande
  };

  payBtn.disabled = true;
  showStatus('Validez le paiement dans votre wallet…');

  // Le client signe dans son wallet, qui envoie la transaction au registre.
  // La réponse du wallet ne compte pas : seul le registre fait foi.
  let walletError = null;
  try {
    await walletManager.signAndSubmit(payment);
  } catch (error) {
    if (error.code === 'SIGN_REJECTED') {
      payBtn.disabled = false;
      showStatus('Paiement refusé par le client.', 'error');
      return;
    }
    // Autre erreur : le paiement est peut-être quand même parti.
    walletError = error;
  }

  // ---------- 4. Vérification sur le registre ----------
  // On cherche, chez le marchand, le paiement de cette commande.
  showStatus('Vérification du paiement sur le registre…');
  try {
    const found = await findPayment(payment.Account, amountDrops);
    if (found) {
      showStatus(
        `Paiement confirmé : ${dropsToXrp(found.delivered)} XRP reçus pour la commande n° ${orderId}.<br>` +
        `<a href="${EXPLORER}${found.hash}" target="_blank" rel="noopener">Voir la transaction</a>`,
        'success'
      );
      return; // commande payée : le bouton reste désactivé
    }
    payBtn.disabled = false;
    showStatus(
      'Aucun paiement trouvé pour cette commande.' +
      (walletError ? `<br>Détail wallet : ${walletError.message}` : ''),
      'error'
    );
  } catch (error) {
    payBtn.disabled = false;
    showStatus(`Vérification impossible : ${error.message}`, 'error');
  }
});

// Parcourt les dernières transactions du marchand, pendant 30 secondes au plus,
// et renvoie le paiement de cette commande s'il est validé et conforme.
async function findPayment(payerAddress, expectedDrops) {
  const client = new Client(TESTNET_URL);
  await client.connect();
  try {
    for (let attempt = 0; attempt < 20; attempt++) {
      const { result } = await client.request({
        command: 'account_tx',
        account: MERCHANT_ADDRESS,
        limit: 20,
      });
      for (const entry of result.transactions) {
        const tx = entry.tx_json ?? entry.tx;
        const meta = entry.meta;
        if (
          entry.validated &&
          tx?.TransactionType === 'Payment' &&
          tx.Destination === MERCHANT_ADDRESS &&
          tx.DestinationTag === orderId &&       // la bonne commande
          tx.Account === payerAddress &&         // le bon client
          meta?.TransactionResult === 'tesSUCCESS' &&
          meta.delivered_amount === String(expectedDrops) // le bon montant, réellement reçu
        ) {
          return { hash: entry.hash ?? tx.hash, delivered: meta.delivered_amount };
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    return null;
  } finally {
    await client.disconnect();
  }
}