import sys
from SurveyDataViewer.settings.base import *

#For error logging (helicon zoo error trace logging doesn't work)
#sys.stderr = open('err.log', 'w')

DEBUG = True
DEPLOYED = True

SITE_ROOT = os.environ['APPL_PHYSICAL_PATH']
SITE_URL = os.environ['APPL_VIRTUAL_PATH'] + "/"

STATIC_ROOT = os.path.join(SITE_ROOT, 'static')
STATIC_URL = SITE_URL + 'static/'

MEDIA_ROOT = os.path.join(SITE_ROOT, 'surveyfiles')
MEDIA_URL = SITE_URL + 'surveyfiles/'