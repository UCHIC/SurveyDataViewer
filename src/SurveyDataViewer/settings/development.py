__author__ = 'Juan'
from SurveyDataViewer.settings.base import *

DATABASE_PATH = os.path.join('Internal')
DATABASES['default']['NAME'] = DATABASE_PATH

DEBUG = True
TEMPLATE_DEBUG = True

STATIC_URL = '/static/'

SITE_URL = ''