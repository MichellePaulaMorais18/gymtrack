# 🏋️ GymTrack

Tracker de academia: registre pesos e repetições de cada treino e acompanhe sua evolução.

## Funcionalidades

- **Séries flexíveis** — cada série tem seu próprio peso e repetições (3×8 ou 8/9/10, como você quiser)
- **Drop sets / progressão de carga** — uma série pode ter várias cargas: 10× 20kg ➜ 10× 15kg
- **"Repetir último"** — ao adicionar um exercício, já vem preenchido com o último treino dele
- **Histórico** — todos os treinos por data, com volume total
- **Progressão** — gráfico de carga máxima por treino em cada exercício
- **Tipos de exercício** — peso × reps, tempo (isometria) e cardio (tempo, velocidade, inclinação)
- **Dieta** — cadastro de alimentos com calorias e macros por porção; monte o prato de cada refeição e veja a soma por refeição e do dia
- **Cardápio** — alimentos padronizados (com busca) e refeições prontas para adicionar na Dieta com um toque
- **Hidratação** — registro de água com meta diária
- **Importar histórico de dieta** — planilha (modelo para baixar), JSON (arquivo ou colado) ou backup; **exportar backup** em JSON
- **Composição corporal** — todas as métricas da balança de bioimpedância por data, com gráfico de qualquer métrica, comparação entre medições e histórico; importação de planilha (.xlsx/.csv) da balança com reconhecimento automático das colunas
- **Evolução** — visão mensal e anual: tabela mês a mês e comparação com o período anterior
- **Balanço** — simulação de gasto calórico (TMB Mifflin-St Jeor + rotina + treino estimado por MET/ACSM), saldo diário, previsão × balança real e leitura de gordura/massa magra pela % de gordura
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
