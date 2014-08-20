from django.conf import settings
from django.conf.urls import patterns, include, url

from surveyinterface.views import HomeView

from django.contrib import admin
admin.autodiscover()

BASE_URL = settings.SITE_URL[1:]

urlpatterns = patterns('',
    # Examples:
    # url(r'^$', 'WaterSurveyData.views.home', name='home'),
    # url(r'^blog/', include('blog.urls')),
    url(r'^' + BASE_URL + '$', HomeView.as_view(), name='survey-viewer-home'),
    url(r'^' + BASE_URL + 'admin/', include(admin.site.urls)),
)
