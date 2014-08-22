from django.conf import settings
from django.conf.urls import patterns, include, url

from surveyinterface.views import HomeView, SurveyView

from django.contrib import admin
admin.autodiscover()

BASE_URL = settings.SITE_URL[1:]

urlpatterns = patterns('',
    url(r'^' + BASE_URL + '$', HomeView.as_view(), name='home'),
    url(r'^' + BASE_URL + 'survey/(?P<pk>\w+)$', SurveyView.as_view(), name='survey-view'),
    url(r'^' + BASE_URL + 'admin/', include(admin.site.urls)),
)