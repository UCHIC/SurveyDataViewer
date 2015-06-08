__author__ = 'Juan'
from SurveyDataViewer.settings.base import *

DEBUG = True
TEMPLATE_DEBUG = True

STATIC_URL = '/static/'
SITE_URL = ''

MEDIA_ROOT = data["media_files_dir"]
MEDIA_URL = '/surveydata/'