// =============================================================
// Payinnov · MVP paiement XRP et RLUSD sur le XRP Ledger
// -------------------------------------------------------------
// Le parcours, en 4 temps :
//   1. On crée une commande (devise + montant + numéro de commande).
//   2. Le client connecte son wallet (Xaman, Crossmark, GemWallet).
//   3. Le client signe un paiement vers l'adresse du marchand.
//   4. On vérifie nous-mêmes, sur le registre, que le paiement est
//      validé, au bon montant, vers le bon marchand, pour la bonne commande.
//
// Nouveau : le client peut payer en RLUSD. Pour cela, le marchand ET
// le client doivent avoir ouvert une "ligne de confiance" RLUSD.
// La page le vérifie avant de laisser payer.
// =============================================================

import { WalletManager, XamanAdapter, CrossmarkAdapter, GemWalletAdapter } from 'xrpl-connect';
import { Client } from 'xrpl';
import {
  NETWORKS, CURRENCIES, pickNetwork, toLedgerAmount, isPaymentFor,
  findRlusdLine, trustSetFor, formatDelivered,
} from './logic.js';

// ---------- Configuration (fichier .env) ----------
const XAMAN_API_KEY = import.meta.env.VITE_XAMAN_API_KEY;
const MERCHANT_ADDRESS = import.meta.env.VITE_MERCHANT_ADDRESS;
const NETWORK_KEY = pickNetwork(import.meta.env.VITE_NETWORK); // 'testnet' par défaut
const NET = NETWORKS[NETWORK_KEY];
// Plafond par paiement. Sur le réseau principal, il protège d'une faute de frappe.
const MAX_AMOUNT = Number(import.meta.env.VITE_MAX_AMOUNT) || (NET.real ? 5 : 1000);

// ---------- Éléments de la page ----------
const $ = (id) => document.getElementById(id);
const amountInput = $('amount');
const currencySelect = $('currency');
const connectBtn = $('connect-btn');
const payBtn = $('pay-btn');
const statusBox = $('status');
const rlusdBox = $('rlusd-box');
const rlusdText = $('rlusd-text');
const trustBtn = $('trust-btn');
const recheckBtn = $('recheck-btn');

function showStatus(message, kind = 'info') {
  statusBox.className = `status ${kind}`;
  statusBox.innerHTML = message;
}

// Le bandeau du haut dit clairement sur quel réseau on est.
const badge = $('network-badge');
badge.textContent = NET.real ? 'Réseau principal · argent réel' : NET.label;
badge.classList.toggle('real', NET.real);

// ---------- 1. La commande ----------
// Le "destination tag" est un nombre attaché au paiement.
// C'est lui qui dit "ce paiement correspond à la commande n° X".
// En production, il viendra de la base de données Payinnov.
const orderId = Math.floor(100000 + Math.random() * 900000);
$('order-id').textContent = orderId;
$('merchant').textContent = MERCHANT_ADDRESS || '(non configuré)';

let paid = false;        // la commande est-elle déjà payée ?
let rlusdReady = false;  // marchand et client sont-ils prêts pour RLUSD ?

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
  network: NETWORK_KEY,
  autoConnect: true,
});

// On branche les écouteurs tout de suite (sinon on rate la reconnexion automatique).
walletManager.on('connect', (account) => {
  $('account').textContent = `Wallet connecté : ${account.address}`;
  connectBtn.textContent = 'Changer de wallet';
  refresh();
});

walletManager.on('disconnect', () => {
  $('account').textContent = '';
  connectBtn.textContent = 'Connecter mon wallet';
  refresh();
});

const connector = $('wallet-connector');
connector.setWalletManager(walletManager);
connectBtn.addEventListener('click', () => connector.open());

// ---------- Devise choisie ----------
function currentCurrency() {
  return currencySelect.value; // 'XRP' ou 'RLUSD'
}

currencySelect.addEventListener('change', refresh);
recheckBtn.addEventListener('click', refresh);

// Met la page à jour : libellé du montant, encart RLUSD, bouton Payer.
async function refresh() {
  const currency = currentCurrency();
  $('amount-label').textContent = `Montant à payer (${CURRENCIES[currency].label})`;
  amountInput.step = CURRENCIES[currency].step;

  const connected = Boolean(walletManager.account);
  if (currency === 'XRP') {
    rlusdBox.hidden = true;
    payBtn.disabled = !connected || paid;
    return;
  }

  // RLUSD : on vérifie les lignes de confiance avant d'autoriser le paiement.
  rlusdBox.hidden = false;
  rlusdReady = false;
  payBtn.disabled = true;
  trustBtn.hidden = true;
  if (!connected) {
    rlusdText.textContent = 'Connectez votre wallet pour vérifier qu’il accepte RLUSD.';
    return;
  }
  rlusdText.textContent = 'Vérification des lignes de confiance RLUSD…';
  try {
    await checkRlusd();
  } catch (error) {
    rlusdText.textContent = `Vérification RLUSD impossible : ${error.message}`;
  }
  payBtn.disabled = !rlusdReady || paid;
}

// Ouvre une connexion au registre, fait le travail, referme.
async function withLedger(work) {
  const client = new Client(NET.url);
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.disconnect();
  }
}

// Lit les lignes de confiance d'un compte vis-à-vis de l'émetteur RLUSD.
async function readRlusdLine(client, account) {
  const { result } = await client.request({
    command: 'account_lines',
    account,
    peer: NET.rlusdIssuer,
    ledger_index: 'validated',
  });
  return findRlusdLine(result.lines, NETWORK_KEY);
}

// Le marchand peut-il recevoir du RLUSD ? Le client en a-t-il ?
async function checkRlusd() {
  const clientAddress = walletManager.account.address;
  const [merchantLine, clientLine] = await withLedger((client) =>
    Promise.all([readRlusdLine(client, MERCHANT_ADDRESS), readRlusdLine(client, clientAddress)])
  );

  if (!merchantLine) {
    rlusdText.innerHTML = NET.real
      ? 'Le marchand n’a pas encore activé RLUSD. Active-le depuis Xaman, sur le compte marchand.'
      : 'Le marchand n’a pas encore activé RLUSD. Dans le terminal : <code>npm run trustline</code>';
    return;
  }
  if (!clientLine) {
    rlusdText.textContent = 'Votre wallet n’accepte pas encore RLUSD. Activez-le en un clic, puis validez dans votre wallet.';
    trustBtn.hidden = false;
    return;
  }

  const balance = Number(clientLine.balance);
  const needed = Number(amountInput.value) || 0;
  if (balance < needed) {
    rlusdText.innerHTML = `Solde RLUSD insuffisant : ${balance} RLUSD.` +
      (NET.rlusdFaucet ? ` Rechargez sur <a href="${NET.rlusdFaucet}" target="_blank" rel="noopener">tryrlusd.com</a>, puis cliquez sur « Vérifier à nouveau ».` : '');
    return;
  }
  rlusdText.textContent = `RLUSD prêt. Solde du client : ${balance} RLUSD.`;
  rlusdReady = true;
}

// Le client ouvre sa ligne de confiance RLUSD : il signe un "TrustSet".
trustBtn.addEventListener('click', async () => {
  const account = walletManager.account.address;
  trustBtn.disabled = true;
  rlusdText.textContent = 'Validez l’activation de RLUSD dans votre wallet…';
  try {
    await walletManager.signAndSubmit(trustSetFor(account, NETWORK_KEY));
  } catch (error) {
    if (error.code === 'SIGN_REJECTED') {
      trustBtn.disabled = false;
      rlusdText.textContent = 'Activation refusée dans le wallet.';
      return;
    }
    // Autre erreur : comme pour le paiement, on ne croit que le registre.
  }
  // On attend que la ligne apparaisse sur le registre (30 secondes au plus).
  rlusdText.textContent = 'Vérification sur le registre…';
  try {
    const line = await withLedger(async (client) => {
      for (let attempt = 0; attempt < 20; attempt++) {
        const found = await readRlusdLine(client, account);
        if (found) return found;
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      return null;
    });
    trustBtn.disabled = false;
    if (!line) {
      rlusdText.textContent = 'La ligne de confiance n’apparaît pas encore. Réessayez dans un instant.';
      return;
    }
  } catch (error) {
    trustBtn.disabled = false;
    rlusdText.textContent = `Vérification impossible : ${error.message}`;
    return;
  }
  refresh();
});

// ---------- 3. Paiement ----------
payBtn.addEventListener('click', async () => {
  const currency = currentCurrency();
  const amount = Number(amountInput.value);
  if (!(amount > 0)) {
    showStatus('Montant invalide.', 'error');
    return;
  }
  if (amount > MAX_AMOUNT) {
    showStatus(`Montant au-dessus du plafond de ce test : ${MAX_AMOUNT} ${currency}.`, 'error');
    return;
  }

  // Le montant, écrit comme le registre l'attend (voir logic.js).
  const ledgerAmount = toLedgerAmount(currency, amount, NETWORK_KEY);

  const payment = {
    TransactionType: 'Payment',
    Account: walletManager.account.address, // le client
    Destination: MERCHANT_ADDRESS,          // le marchand
    Amount: ledgerAmount,
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
    const found = await findPayment(payment.Account, ledgerAmount);
    if (found) {
      paid = true;
      showStatus(
        `Paiement confirmé : ${formatDelivered(found.delivered)} reçus pour la commande n° ${orderId}.<br>` +
        `<a href="${NET.explorer}${found.hash}" target="_blank" rel="noopener">Voir la transaction</a>`,
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
async function findPayment(payerAddress, expected) {
  return withLedger(async (client) => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const { result } = await client.request({
        command: 'account_tx',
        account: MERCHANT_ADDRESS,
        limit: 20,
      });
      for (const entry of result.transactions) {
        if (isPaymentFor(entry, { merchant: MERCHANT_ADDRESS, payer: payerAddress, orderId, expected })) {
          const tx = entry.tx_json ?? entry.tx;
          return { hash: entry.hash ?? tx.hash, delivered: entry.meta.delivered_amount };
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    return null;
  });
}

refresh();
