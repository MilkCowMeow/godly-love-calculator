"""Read the already published, self-contained calculator dataset without executing JS."""
import json
def extract(html,name):
 marker='const '+name+'='
 start=html.index(marker)+len(marker)
 return json.JSONDecoder().raw_decode(html[start:])[0]
