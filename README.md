# 🏋️ GymTrack

Tracker de academia: registre pesos e repetições de cada treino e acompanhe sua evolução.

## Funcionalidades

- **Séries flexíveis** — cada série tem seu próprio peso e repetições (3×8 ou 8/9/10, como você quiser)
- **Drop sets / progressão de carga** — uma série pode ter várias cargas: 10× 20kg ➜ 10× 15kg
- **"Repetir último"** — ao adicionar um exercício, já vem preenchido com o último treino dele
- **Histórico** — todos os treinos por data, com volume total
- **Progressão** — gráfico de carga máxima por treino em cada exercício
- Login com Google + dados na nuvem (Firestore) — funciona em qualquer dispositivo

## Configuração do Firebase

1. No [Console do Firebase](https://console.firebase.google.com), abra o projeto **gymtrack**
2. Clique em **Adicionar app** → ícone **Web (`</>`)** → registre o app
3. Copie o objeto `firebaseConfig` e cole no início do [app.js](app.js) (substituindo os `COLE_AQUI`)
4. Em **Criação** (Build) → **Authentication** → **Sign-in method** → ative **Google**
5. Em **Criação** → **Firestore Database** → **Criar banco de dados** (modo produção)
6. Na aba **Regras** do Firestore, use:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

## Rodando

É um app estático — basta abrir o `index.html` num servidor local ou publicar no GitHub Pages / Firebase Hosting.

> Para login com Google funcionar, o domínio precisa estar em **Authentication → Settings → Domínios autorizados** (localhost já vem liberado).
