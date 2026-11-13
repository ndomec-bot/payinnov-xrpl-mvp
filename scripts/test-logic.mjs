// Tests des règles de paiement : npm test
import assert from 'node:assert/strict';
import { validate } from 'xrpl';
import { NETWORKS, RLUSD_HEX, pickNetwork, toLedgerAmount, sameAmount, isPaymentFor, findRlusdLine, trustSetFor, formatDelivered } from '../logic.js';

const M = 'rJP722KoEbWsW555X2t8UunCdgDm1BFVHE', C = 'rN7n7otQDd6FczFgLdlqtyMVrn3HMfXoQT';
const T = NETWORKS.testnet.rlusdIssuer, MAIN = NETWORKS.mainnet.rlusdIssuer;

// Réseau : seul "mainnet" exact passe en réel.
assert.equal(pickNetwork(undefined), 'testnet');
assert.equal(pickNetwork('Mainnet'), 'testnet');
assert.equal(pickNetwork('mainnet'), 'mainnet');

// Montants
assert.equal(toLedgerAmount('XRP', 10, 'testnet'), '10000000');
assert.equal(toLedgerAmount('XRP', '0.5', 'testnet'), '500000');
assert.deepEqual(toLedgerAmount('RLUSD', 10, 'testnet'), { currency: RLUSD_HEX, issuer: T, value: '10' });
assert.deepEqual(toLedgerAmount('RLUSD', '12.50', 'mainnet'), { currency: RLUSD_HEX, issuer: MAIN, value: '12.5' });
assert.equal(toLedgerAmount('RLUSD', 0.1 + 0.2, 'testnet').value, '0.3');
assert.throws(() => toLedgerAmount('RLUSD', 0, 'testnet'));
assert.throws(() => toLedgerAmount('EUR', 1, 'testnet'));
assert.notEqual(T, MAIN);

// Comparaison des montants
const exp = toLedgerAmount('RLUSD', 10, 'testnet');
assert.ok(sameAmount({ currency: RLUSD_HEX, issuer: T, value: '10' }, exp));
assert.ok(!sameAmount({ currency: RLUSD_HEX, issuer: T, value: '9.99' }, exp), 'paiement partiel refusé');
assert.ok(!sameAmount({ currency: RLUSD_HEX, issuer: C, value: '10' }, exp), 'faux émetteur refusé');
assert.ok(!sameAmount('10000000', exp), 'XRP à la place de RLUSD refusé');
assert.ok(!sameAmount({ currency: RLUSD_HEX, issuer: T, value: '10' }, '10000000'), 'RLUSD à la place de XRP refusé');
assert.ok(sameAmount('10000000', '10000000'));

// Reconnaissance du paiement
const entry = (over = {}, metaOver = {}) => ({
  validated: true, hash: 'ABC',
  tx_json: { TransactionType: 'Payment', Account: C, Destination: M, DestinationTag: 123456, ...over },
  meta: { TransactionResult: 'tesSUCCESS', delivered_amount: { currency: RLUSD_HEX, issuer: T, value: '10' }, ...metaOver },
});
const want = { merchant: M, payer: C, orderId: 123456, expected: exp };
assert.ok(isPaymentFor(entry(), want));
assert.ok(!isPaymentFor(entry({ DestinationTag: 1 }), want), 'autre commande');
assert.ok(!isPaymentFor(entry({ Account: M }), want), 'autre client');
assert.ok(!isPaymentFor(entry({ Destination: C }), want), 'autre marchand');
assert.ok(!isPaymentFor(entry({}, { TransactionResult: 'tecPATH_DRY' }), want), 'échec');
assert.ok(!isPaymentFor({ ...entry(), validated: false }, want), 'non validée');
assert.ok(!isPaymentFor(entry({}, { delivered_amount: { currency: RLUSD_HEX, issuer: T, value: '1' } }), want), 'partiel');
assert.ok(isPaymentFor({ validated: true, tx: entry().tx_json, meta: { TransactionResult: 'tesSUCCESS', delivered_amount: '10000000' } }, { ...want, expected: '10000000' }), 'XRP, ancien format');

// Lignes de confiance
assert.equal(findRlusdLine([], 'testnet'), null);
assert.equal(findRlusdLine(undefined, 'testnet'), null);
assert.equal(findRlusdLine([{ account: MAIN, currency: RLUSD_HEX, balance: '5' }], 'testnet'), null, 'mauvais émetteur');
assert.equal(findRlusdLine([{ account: T, currency: RLUSD_HEX, balance: '5' }], 'testnet').balance, '5');

// Les transactions ont une forme que la bibliothèque XRPL accepte.
validate(trustSetFor(C, 'testnet'));
validate({ TransactionType: 'Payment', Account: C, Destination: M, Amount: exp, DestinationTag: 123456 });
validate({ TransactionType: 'Payment', Account: C, Destination: M, Amount: '10000000', DestinationTag: 123456 });

assert.equal(formatDelivered('10000000'), '10 XRP');
assert.equal(formatDelivered({ value: '10' }), '10 RLUSD');
console.log('Tous les tests passent.');
