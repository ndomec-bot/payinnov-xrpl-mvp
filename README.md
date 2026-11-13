# Payinnov · MVP paiement XRP (XRPL testnet)

Une page de paiement : le client connecte son wallet XRPL, paie en XRP, et la page vérifie sur le registre que le paiement est bien arrivé chez le marchand, pour la bonne commande.

Tout se passe sur le **testnet** : les XRP sont gratuits et n'ont aucune valeur.

## Les fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | La page : montant, bouton de connexion, bouton de paiement |
| `main.js` | Toute la logique, commentée étape par étape |
| `public/style.css` | La mise en forme |
| `.env.example` | Le modèle de configuration (clé Xaman, adresse marchand) |

## Installation sur Windows (une seule fois)

1. **Node.js** : télécharge la version LTS sur https://nodejs.org et installe-la (options par défaut).
2. **VS Code** (éditeur de code) : https://code.visualstudio.com
3. Dézippe ce dossier, par exemple dans `Documents\payinnov-xrpl-mvp`.
4. Dans VS Code : *Fichier > Ouvrir le dossier*, choisis ce dossier.
5. Ouvre un terminal : *Terminal > Nouveau terminal*, puis tape :

```
npm install
```

## Configuration (une seule fois)

**a. L'adresse du marchand (testnet)**
1. Va sur https://xrpl.org/resources/dev-tools/xrp-faucets
2. Clique sur *Generate Testnet credentials*.
3. Note l'**adresse** (commence par `r`) et le **secret** (commence par `s`). Garde le secret pour toi.

**b. La clé API Xaman**
1. Va sur https://apps.xumm.dev et connecte-toi avec ton appli Xaman.
2. Crée une application.
3. Dans ses réglages, ajoute `http://localhost:5173` comme origine / URL de redirection autorisée.
4. Copie la clé API.

**c. Le fichier `.env`**
Copie `.env.example` en `.env` et remplis les deux lignes.

**d. Le wallet du client (pour tester)**
Dans Xaman sur ton téléphone : *Réglages > Avancé > Nœud* et choisis **Testnet**. Crée ou importe un compte testnet, puis alimente-le avec le faucet (étape a, deuxième jeu d'identifiants).

## Lancer

```
npm run dev
```

Ouvre http://localhost:5173 dans ton navigateur.

## Le test

1. Saisis un montant (ex. 10 XRP).
2. *Connecter mon wallet* : choisis Xaman, scanne le QR code.
3. *Payer* : valide dans Xaman.
4. La page affiche « Paiement confirmé » avec un lien vers l'explorateur testnet.

## Ce que le MVP ne fait pas encore

- Enregistrer la commande dans la base Payinnov (le numéro est tiré au hasard).
- Vérifier côté serveur (aujourd'hui la vérification tourne dans le navigateur).
- Convertir en stablecoin.
- Le parcours TPE.

Ce sont les étapes suivantes.

---

## Nouveau : payer en RLUSD (testnet)

RLUSD est le stablecoin dollar de Ripple. Pour en recevoir, un compte XRPL doit d'abord
ouvrir une **ligne de confiance** vers l'émetteur. Le marchand et le client doivent le faire, une seule fois.
Chaque ligne de confiance bloque 0,2 XRP de réserve sur le compte.

1. Copie les nouveaux fichiers dans ton dossier `payinnov-xrpl-mvp` (garde ton `.env`).
2. Ouvre ton `.env` et ajoute ces lignes :

   ```
   VITE_NETWORK=testnet
   MERCHANT_SECRET=le_secret_testnet_du_compte_marchand
   ```

   Le secret commence par `s`. C'est celui que le faucet t'a donné avec l'adresse du marchand.
3. Dans le terminal : `npm install` puis `npm test`. Tu dois lire « Tous les tests passent. »
4. Active RLUSD côté marchand : `npm run trustline`
5. Lance la page : `npm run dev`, puis ouvre http://localhost:5173
6. Choisis la devise **RLUSD**, connecte ton wallet client.
7. Clique sur **Activer RLUSD dans mon wallet** et valide dans Xaman.
8. Va sur https://tryrlusd.com/, colle l'adresse du compte client, demande des RLUSD de test.
9. Reviens sur la page, clique sur **Vérifier à nouveau**, puis **Payer**.

La page confirme le paiement seulement si le registre montre du RLUSD du bon émetteur, au bon montant.

## Passer au réseau principal (argent réel)

À faire seulement quand XRP et RLUSD passent sur le testnet.

1. **Un compte marchand réel.** Crée-le dans Xaman. Il doit contenir au moins 1 XRP de réserve, plus 0,2 XRP pour RLUSD, plus de quoi payer les frais. Garde sa phrase secrète hors ligne.
2. **Active RLUSD sur ce compte depuis Xaman** (ajout de l'actif RLUSD, émetteur `rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De`). Vérifie l'émetteur caractère par caractère. Le script `npm run trustline` refuse le réseau principal : un vrai secret ne s'écrit pas dans un fichier.
3. **Modifie le `.env`** :

   ```
   VITE_NETWORK=mainnet
   VITE_MERCHANT_ADDRESS=adresse_du_compte_marchand_réel
   VITE_MAX_AMOUNT=5
   MERCHANT_SECRET=
   ```

   Vide la ligne `MERCHANT_SECRET`.
4. **Bascule Xaman sur le réseau principal** (côté client aussi).
5. Relance `npm run dev`. Le bandeau rouge « Réseau principal · argent réel » doit s'afficher.
6. **Premier paiement : 1 XRP.** Vérifie la transaction sur l'explorateur. Puis 1 RLUSD.

Le fichier `.env` ne va jamais sur GitHub. Le fichier `.gitignore` l'exclut déjà.

### Ce qui manque encore pour de vrais marchands

Ce MVP vérifie le paiement dans le navigateur. Pour la production, il faut :

- un serveur qui crée la commande et vérifie le paiement (le navigateur du client ne peut pas être la preuve) ;
- un numéro de commande unique venant de ta base, pas tiré au hasard ;
- une mise en ligne en HTTPS, avec l'adresse déclarée dans ton application Xaman ;
- ton propre accès au registre plutôt qu'un serveur public.
