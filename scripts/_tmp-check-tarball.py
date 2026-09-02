import json, tarfile
p = "/var/www/nexlify/public/downloads/nexlify-panel.tar.gz"
with tarfile.open(p) as t:
    d = json.load(t.extractfile("./package.json"))
    names = t.getnames()
print("ver", d.get("version"))
print("watch", sum(1 for x in names if "watch-folder-m3u" in x))
print("whmcs_module", sum(1 for x in names if "whmcs-module" in x))
print("build_whmcs", sum(1 for x in names if "build-whmcs" in x))
