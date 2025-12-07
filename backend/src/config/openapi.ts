export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'BCE Exchange Rates API',
    version: '1.0.0',
    description: `API pour récupérer les taux de change de la Banque Centrale Européenne (ECB) avec cache Redis (1h TTL) et fallback CSV.

**Documentation officielle ECB:**
- [Vue d'ensemble API](https://data.ecb.europa.eu/help/api/overview)
- [Documentation Data API](https://data.ecb.europa.eu/help/api/data)
- [Astuces et exemples](https://data.ecb.europa.eu/help/api/useful-tips)

**Caractéristiques:**
- Cache Redis: 1 heure (3600s)
- Rate limiting: 30 requêtes/min vers ECB
- Fallback CSV: données historiques locales si ECB indisponible
- Format: JSON`,
    contact: {
      name: 'API Support'
    }
  },
  servers: [
    {
      url: 'http://localhost:8000',
      description: 'Development server'
    }
  ],
  paths: {
    '/api/health': {
      get: {
        summary: 'Health check',
        description: 'Vérifie le statut de l\'API et de Redis',
        tags: ['System'],
        responses: {
          '200': {
            description: 'API is healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    timestamp: { type: 'string', format: 'date-time' },
                    ecbBlockedUntil: { type: 'string', format: 'date-time', nullable: true },
                    redis: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', example: 'connected' },
                        cachedKeys: { type: 'number', example: 5 }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/bce-exchange': {
      get: {
        summary: 'Get exchange rates',
        description: `Récupère les taux de change pour les devises spécifiées (cache 1h, fallback CSV si ECB fail)

**URLs à copier/coller (virgules non-encodées):**

Taux actuels:
\`\`\`
http://localhost:8000/api/bce-exchange?currencies=USD,CHF,GBP
\`\`\`

Taux à une date:
\`\`\`
http://localhost:8000/api/bce-exchange?currencies=USD,CHF&date=2025-12-06
\`\`\`

**Note importante:**
- Si la date demandée n'existe pas (weekend, futur, férié), l'API retourne une erreur avec le message ECB
- Le champ \`requestedDate\` indique la date demandée
- Exemple: demander dimanche 2025-12-08 (futur) → retourne status "error" avec le message d'erreur`,
        tags: ['Exchange Rates'],
        parameters: [
          {
            name: 'currencies',
            in: 'query',
            required: true,
            description: 'Devises séparées par virgule',
            schema: { type: 'string' },
            example: 'USD,CHF,GBP'
          },
          {
            name: 'date',
            in: 'query',
            required: false,
            description: 'Date au format YYYY-MM-DD (optionnel)',
            schema: { type: 'string', format: 'date' },
            example: '2025-12-06'
          }
        ],
        'x-codeSamples': [
          {
            lang: 'Shell',
            source: "curl 'http://localhost:8000/api/bce-exchange?currencies=USD,CHF,GBP'"
          },
          {
            lang: 'Shell',
            label: 'With date',
            source: "curl 'http://localhost:8000/api/bce-exchange?currencies=USD,CHF&date=2025-12-06'"
          }
        ],
        responses: {
          '200': {
            description: 'Taux de change récupérés',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'success' },
                    date: { type: 'string', format: 'date' },
                    base: { type: 'string', example: 'EUR' },
                    rates: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          currency: { type: 'string', example: 'USD' },
                          rate: { type: 'number', example: 1.0623 },
                          flag: { type: 'string', example: 'us' }
                        }
                      }
                    },
                    source: { type: 'string', example: 'European Central Bank (ECB)' },
                    cached: { type: 'boolean', example: true }
                  }
                }
              }
            }
          },
          '400': {
            description: 'Paramètre manquant, date invalide ou aucune donnée disponible',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'error' },
                    message: { type: 'string', example: 'Aucune donnée disponible pour cette date' },
                    requestedDate: { type: 'string', example: '2025-12-08' },
                    ecbRequestUrl: { type: 'string', example: 'https://data-api.ecb.europa.eu/service/data/EXR/...' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/bce-exchange/history': {
      get: {
        summary: 'Get historical rates',
        description: `Récupère l'historique des taux de change pour une période donnée.

**Comportement :** Pour chaque devise demandée, l'API retourne les données les plus récentes disponibles dans la période spécifiée. Si une date spécifique n'a pas de données (weekend, jour férié), la date la plus récente antérieure est automatiquement utilisée.

**L'API ECB utilise le paramètre \`lastNObservations\` pour récupérer les N dernières observations disponibles** puis filtre les résultats pour la période demandée.

**URL à copier/coller:**
\`\`\`
http://localhost:8000/api/bce-exchange/history?currencies=USD,CHF&start=2025-11-01&end=2025-12-06
\`\`\``,
        tags: ['Exchange Rates'],
        'x-codeSamples': [
          {
            lang: 'Shell',
            source: "curl 'http://localhost:8000/api/bce-exchange/history?currencies=USD,CHF&start=2025-11-01&end=2025-12-06'"
          }
        ],
        parameters: [
          {
            name: 'currencies',
            in: 'query',
            required: true,
            description: 'Devises séparées par virgule',
            schema: { type: 'string' },
            example: 'USD,CHF'
          },
          {
            name: 'start',
            in: 'query',
            required: true,
            description: 'Date de début',
            schema: { type: 'string', format: 'date' },
            example: '2025-11-01'
          },
          {
            name: 'end',
            in: 'query',
            required: true,
            description: 'Date de fin',
            schema: { type: 'string', format: 'date' },
            example: '2025-12-06'
          }
        ],
        responses: {
          '200': {
            description: 'Historique récupéré avec succès',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'success' },
                    start: { type: 'string', format: 'date', example: '2025-11-01' },
                    end: { type: 'string', format: 'date', example: '2025-12-06' },
                    referenceBase: { type: 'string', example: 'EUR' },
                    source: { type: 'string', example: 'European Central Bank (ECB)' },
                    queriedAt: { type: 'string', format: 'date-time', example: '2025-12-07T10:00:00.000Z' },
                    data: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          currency: { type: 'string', example: 'USD' },
                          date: { type: 'string', format: 'date', example: '2025-12-01' },
                          rate: { type: 'number', example: 1.0623 }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          '400': {
            description: 'Paramètres manquants ou invalides',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'error' },
                    message: { type: 'string', example: 'Parameters "currencies", "start" and "end" are required' }
                  }
                },
                examples: {
                  missingParams: {
                    summary: 'Paramètres manquants',
                    value: {
                      status: 'error',
                      message: 'Parameters "currencies", "start" and "end" are required'
                    }
                  },
                  invalidDate: {
                    summary: 'Format de date invalide',
                    value: {
                      status: 'error',
                      message: 'Invalid date format. Use YYYY-MM-DD'
                    }
                  }
                }
              }
            }
          },
          '429': {
            description: 'Trop de requêtes vers l\'API ECB (rate limit atteint)',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'error' },
                    message: { type: 'string', example: 'L\'API ECB a temporairement bloqué l\'accès.' },
                    blocked: { type: 'boolean', example: true }
                  }
                }
              }
            }
          },
          '500': {
            description: 'Erreur serveur ou API ECB indisponible',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'error' },
                    message: { type: 'string', example: 'ECB API error or internal server error' }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
};
