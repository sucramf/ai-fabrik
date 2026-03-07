PAYMENT – Varje produkt kan aktiveras individuellt.

Sätt API/credentials i payment_config.json:
  - Stripe: secret_key + publishable_key
  - PayPal: client_id + client_secret
  - Apple Pay: merchant_id
  - Google Pay: merchant_id

En rad per provider räcker; ingen live-transaktion förrän nycklar är satta.