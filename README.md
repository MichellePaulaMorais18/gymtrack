# 🏋️ GymTrack

Tracker de academia: registre pesos e repetições de cada treino e acompanhe sua evolução.

## Funcionalidades

- **Séries flexíveis** — cada série tem seu próprio peso e repetições (3×8 ou 8/9/10, como você quiser)
- **Drop sets / progressão de carga** — uma série pode ter várias cargas: 10× 20kg ➜ 10× 15kg
- **"Repetir último"** — ao adicionar um exercício, já vem preenchido com o último treino dele
- **Histórico** — todos os treinos por data, com volume total
- **Progressão** — gráfico de carga máxima por treino em cada exercício
- Login com Google + dados na nuvem (Realtime Database) — funciona em qualquer dispositivo

## Configuração do Firebase

1. No [Console do Firebase](https://console.firebase.google.com), abra o projeto **gymtrack**
2. Em **Criação** (Build) → **Authentication** → **Sign-in method** → ative **Google**
3. Em **Criação** → **Realtime Database** → crie o banco (se ainda não existir)
4. Na aba **Regras** do Realtime Database, use:

```json
{
  "rules": {
    "users": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    }
  }
}
```

## Rodando

É um app estático — basta abrir o `index.html` num servidor local ou publicar no GitHub Pages / Firebase Hosting.

> Para login com Google funcionar, o domínio precisa estar em **Authentication → Settings → Domínios autorizados** (localhost já vem liberado).
