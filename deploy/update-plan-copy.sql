-- Refresh plan marketing copy (safe to re-run)
UPDATE Plan SET description = 'Run the full Nexlify panel free for a week — no card required.',
  featuresJson = '{"servers":3,"lines":"Unlimited","maxMainServers":1,"maxLoadBalancers":2,"allPlugins":false,"highlights":["Full Starter panel for 7 days","Unlimited lines — real production limits","One free trial per account","Upgrade anytime to keep your setup"]}'
WHERE slug = 'trial';

UPDATE Plan SET description = 'Everything you need to launch — without the enterprise price tag.',
  featuresJson = '{"servers":3,"lines":"Unlimited","maxMainServers":1,"maxLoadBalancers":2,"allPlugins":false,"highlights":["1 main panel + 2 load balancers","Reseller & back-office built in","Web player your subscribers can use","License delivered instantly at checkout","Add media & music plugins à la carte"]}'
WHERE slug = 'starter';

UPDATE Plan SET description = 'For operators who are growing fast and need room to scale.',
  featuresJson = '{"servers":11,"lines":"Unlimited","maxMainServers":1,"maxLoadBalancers":10,"allPlugins":false,"highlights":["1 main panel + 10 load balancers","Everything in Starter, plus more headroom","Priority support (~1 hour response)","WHMCS auto suspend & renew sync","Scale streams without switching platforms"]}'
WHERE slug = 'main';

UPDATE Plan SET description = 'The complete Nexlify stack — every plugin unlocked, maximum capacity.',
  featuresJson = '{"servers":51,"lines":"Unlimited","maxMainServers":1,"maxLoadBalancers":50,"allPlugins":true,"highlights":["1 main panel + 50 load balancers","Every plugin included — no add-ons needed","Plex, Emby, Jellyfin, Spotify & more","Fastest support (~30 min response)","Best value if you want everything unlocked"]}'
WHERE slug = 'top-tier';
