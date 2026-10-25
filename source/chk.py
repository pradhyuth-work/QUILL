import re,subprocess,sys
h=open('dist/artifact.html').read()
js=re.search(r'<script>\n(.*)</script>',h,re.S).group(1)
open('dist/check.js','w').write(js)
