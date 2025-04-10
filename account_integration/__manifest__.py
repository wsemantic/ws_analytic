# -*- coding: utf-8 -*-
{
    'name': "Account Integration",
    'summary': """Account Integration""",
    'description': """Account Integration""",
    'author': "My Company",
    'website': "https://www.yourcompany.com",
    'category': '',
    'version': '1.0',
    'depends': ['account', 'sale_management'],
    'assets': {
        'web.assets_backend': [
            'account_integration/static/src/js/analytic_distribution.js',
            'account_integration/static/src/xml/analytic_distribution.xml',
            'account_integration/static/src/scss/analytic_distribution.scss',
        ],
    },
}
