from SurveyDataViewer.settings.base import *

DEBUG = False
TEMPLATE_DEBUG = False
DEPLOYED = True

ALLOWED_HOSTS = ['127.0.0.1', 'localhost']

if "host" in config:
    ALLOWED_HOSTS.append(config["host"])
if "host_alt" in config:
    ALLOWED_HOSTS.append(config["host_alt"])

STATIC_ROOT = config["static_root"]
STATIC_URL = config["static_url"]
MEDIA_ROOT = config["media_root"]
MEDIA_URL = config["media_url"]
SITE_URL = ''
