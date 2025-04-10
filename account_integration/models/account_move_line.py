# -*- coding: utf-8 -*-

from odoo import models 

class AccountMoveLine(models.Model):
    _inherit = 'account.move.line'
    
    def _prepare_analytic_lines(self):
        self.ensure_one()
        analytic_line_vals = []
        if self.analytic_distribution_extended:
            # Use the extended distribution data
            for account_id, distribution_data in self.analytic_distribution_extended.items():
                if isinstance(distribution_data, dict):
                    # Get the values from extended data
                    percentage = float(distribution_data.get('percentage', 0))
                    product_id = distribution_data.get('product_id', False)
                    amount = distribution_data.get('amount', 0)
                    
                    # Prepare the analytic line values
                    line_values = self._prepare_analytic_distribution_line_extended(
                        percentage, 
                        int(account_id), 
                        product_id,
                        amount
                    )
                    if line_values:
                        analytic_line_vals.append(line_values)
            move_to_reinvoice = self.env['account.move.line']
            if len(analytic_line_vals) > 0:
                for index, move_line in enumerate(self):
                    values = analytic_line_vals[index]
                    if 'so_line' not in values:
                        if move_line._sale_can_be_reinvoice():
                            move_to_reinvoice |= move_line

            # insert the sale line in the create values of the analytic entries
            if move_to_reinvoice.filtered(lambda aml: not aml.move_id.reversed_entry_id and aml.product_id):  # only if the move line is not a reversal one
                map_sale_line_per_move = move_to_reinvoice._sale_create_reinvoice_sale_line()
                for values in analytic_line_vals:
                    sale_line = map_sale_line_per_move.get(values.get('move_line_id'))
                    if sale_line:
                        values['so_line'] = sale_line.id

            return analytic_line_vals
        else:
            res = super(AccountMoveLine, self)._prepare_analytic_lines()
            return res
        
    def _prepare_analytic_distribution_line_extended(self, percentage, account_id, product_id, amount):
        """ Prepare the values used to create() an account.analytic.line with extended data.
        """
        self.ensure_one()
        account = self.env['account.analytic.account'].browse(account_id)
        if not account.exists():
            return False

        # Use the provided amount or calculate it based on percentage
        if amount == 0:
            amount = -self.balance * percentage / 100.0

        default_name = self.name or (self.ref or '/' + ' -- ' + (self.partner_id and self.partner_id.name or '/'))
        return {
            'name': default_name,
            'date': self.date,
            'account_id': account_id,
            'partner_id': self.partner_id.id,
            'unit_amount': self.quantity,
            'product_id': product_id or (self.product_id and self.product_id.id) or False,
            'product_uom_id': self.product_uom_id and self.product_uom_id.id or False,
            'amount': amount,
            'general_account_id': self.account_id.id,
            'ref': self.ref,
            'move_line_id': self.id,
            'user_id': self.move_id.invoice_user_id.id or self._uid,
            'company_id': account.company_id.id or self.company_id.id or self.env.company.id,
            'category': 'invoice' if self.move_id.is_sale_document() else 'vendor_bill' if self.move_id.is_purchase_document() else 'other',
        } 
