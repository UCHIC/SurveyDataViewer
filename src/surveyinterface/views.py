from django.views.generic import ListView, DetailView, TemplateView

from surveyinterface.models import Survey

# Create your views here.


class HomeView(ListView):
    model = Survey
    template_name = "surveyinterface/home.html"


class SurveyView(DetailView):
    model = Survey
    template_name = "surveyinterface/survey.html"


class SurveyInfoView(SurveyView):
    template_name = "surveyinterface/survey-info.html"


class AboutView(TemplateView):
    template_name = "surveyinterface/about.html"


class ContactView(TemplateView):
    template_name = "surveyinterface/contact.html"