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
