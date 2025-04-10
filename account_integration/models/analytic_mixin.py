# -*- coding: utf-8 -*-

from odoo import fields, models 

class AnalyticMixin(models.AbstractModel):
    _inherit = 'analytic.mixin'
    
    analytic_distribution_extended = fields.Json(
        'Extended Analytic Distribution', copy=True
    )
