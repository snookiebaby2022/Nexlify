#!/bin/bash
curl -sS -m 15 -A 'Lavf/58.29.100' 'http://127.0.0.1:8080/player_api.php?username=sme_snooki_c7weo&password=bv5sfzkyep&action=get_live_categories' > /tmp/cats.json
python3 <<'PY'
import json
d=json.load(open('/tmp/cats.json'))
print('live_categories', len(d))
print('first5', [(x['category_id'], x['category_name']) for x in d[:5]])
PY
curl -sS -m 25 -A 'Lavf/58.29.100' 'http://127.0.0.1:8080/player_api.php?username=sme_snooki_c7weo&password=bv5sfzkyep&action=get_live_streams' > /tmp/streams.json
python3 <<'PY'
import json
d=json.load(open('/tmp/streams.json'))
print('all_streams', len(d))
if d:
    s=d[0]
    print('sample_keys', sorted(s.keys())[:12])
    print('sample', {k:s.get(k) for k in ['name','category_id','stream_id','category_name']})
    from collections import Counter
    c=Counter(str(x.get('category_id','')) for x in d)
    print('unique_category_ids_in_streams', len(c))
    print('top_cats', c.most_common(5))
PY
