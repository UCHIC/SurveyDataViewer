__author__ = 'Juan'
from SurveyDataViewer.settings.base import *

DATABASE_PATH = os.path.join('SurveysDatabase_dev.sql')
DATABASES['default']['NAME'] = DATABASE_PATH

DEBUG = True
TEMPLATE_DEBUG = True

STATIC_URL = '/static/'
SITE_URL = ''

MEDIA_ROOT = os.path.join('surveyinterface', 'surveyfiles')
MEDIA_URL = '/surveydata/'

