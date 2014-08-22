from django.contrib import admin
from surveyinterface.models import Survey
# Register your models here.


class SurveyAdmin(admin.ModelAdmin):
    pass

admin.site.register(Survey, SurveyAdmin)