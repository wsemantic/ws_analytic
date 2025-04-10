# -*- coding: utf-8 -*-

from odoo import models 

class SaleOrderLine(models.Model):
    _inherit = 'sale.order.line'
    
    def _prepare_invoice_line(self, **optional_values):
        res = super(SaleOrderLine, self)._prepare_invoice_line(**optional_values)
        if self.analytic_distribution_extended:
            res.update({
                'analytic_distribution_extended': self.analytic_distribution_extended
            })
        return res
