/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { _lt } from "@web/core/l10n/translation";
import { standardFieldProps } from "@web/views/fields/standard_field_props";
import { AnalyticDistribution } from "@analytic/components/analytic_distribution/analytic_distribution";

patch(AnalyticDistribution.prototype, 'analytic_distribution', {
    async formatData(nextProps) {
        const data = nextProps.value;
        const extendedData = nextProps.record.data.analytic_distribution_extended || {};
        const analytic_account_ids = Object.keys(data).map((id) => parseInt(id));
        const records = analytic_account_ids.length ? await this.fetchAnalyticAccounts([["id", "in", analytic_account_ids]]) : [];
        
        // Fetch products information if we have product IDs
        const productIds = Object.values(extendedData)
            .map(value => (value?.product_id || false))
            .filter(id => id !== false);
        
        const products = productIds.length ? await this.fetchProductTemplate([["id", "in", productIds]]) : [];
        const productsById = Object.fromEntries(products.map(p => [p.id, p]));

        let widgetData = Object.assign({}, ...this.allPlans.map((plan) => ({[plan.id]: {...plan, distribution: []}})));
        
        records.map((record) => {
            if (!widgetData[record.root_plan_id[0]]) {
                widgetData[record.root_plan_id[0]] = { distribution: [] }
            }
            const recordData = extendedData[record.id] || {};
            const product = recordData.product_id ? productsById[recordData.product_id] : null;
            
            widgetData[record.root_plan_id[0]].distribution.push({
                analytic_account_id: record.id,
                percentage: data[record.id],
                id: this.nextId++,
                group_id: record.root_plan_id[0],
                analytic_account_name: record.display_name,
                product_id: recordData.product_id || null,
                analytic_product_name: product ? product.display_name : "",
                amount: recordData.amount || 0,
                color: record.color,
            });
        });

        this.state.list = widgetData;
        if (records.length < Object.keys(data).length) {
            this.save();
        }
    },

    sourcesProductTemplate(groupId) {
        return [this.optionsSourceProduct(groupId)];
    },

    async fetchProductTemplate(domain, limit=null) {
        const args = {
            domain: domain,
            fields: ["id", "display_name", "color"],
            context: [],
        }
        if (limit) {
            args['limit'] = limit;
        }
        if (domain.length === 1 && domain[0][0] === "id") {
            //batch these orm calls
            return await this.props.record.model.orm.read("product.product", domain[0][2], args.fields, {});
        }
        return await this.orm.call("product.product", "search_read", [], args);
    },

    get existingProductTemplateIDs() {
        return this.listFlat.filter((i) => !!i.product_id).map((i) => i.product_id);
    },

    ProductTemplateDomain(groupId=null) {
        let domain = [['id', 'not in', this.existingProductTemplateIDs]];
        if (this.props.record.data.company_id){
            domain.push(
                '|',
                ['company_id', '=', this.props.record.data.company_id[0]],
                ['company_id', '=', false]
            );
        }

        // if (groupId) {
        //     domain.push(['root_plan_id', '=', groupId]);
        // }
        return domain;
    },

    searchProductTemplateDomain(searchTerm) {
        return [
            '|',
            ["name", "ilike", searchTerm],
            ['default_code', 'ilike', searchTerm],
        ];
    },

    async loadOptionsSourceProduct(groupId, searchTerm) {
        const searchLimit = 6;

        const records = await this.fetchProductTemplate([
            ...this.ProductTemplateDomain(groupId),
            ...this.searchProductTemplateDomain(searchTerm)], searchLimit + 1);

        let options = records.map((result) => ({
            value: result.id,
            label: result.display_name,
            color: result.color,
        }));

        if (searchLimit < records.length) {
            options.push({
                label: this.env._t("Search More..."),
                action: (editedTag) => this.onSearchMore(searchTerm, editedTag),
                classList: "o_m2o_dropdown_option o_m2o_dropdown_option_search_more",
            });
        }

        if (!options.length) {
            options.push({
                label: this.env._t("No Product for this plan"),
                classList: "o_m2o_no_result",
                unselectable: true,
            });
        }

        return options;
    },

    optionsSourceProduct(groupId) {
        return {
            placeholder: this.env._t("Loading..."),
            options:(searchTerm) => this.loadOptionsSourceProduct(groupId, searchTerm),
        };
    },

    async percentageChanged(dist_tag, ev) {
        dist_tag.percentage = this.parse(ev.target.value);
        
        if (dist_tag.percentage == 0) {
            this.deleteTag(dist_tag.id, dist_tag.group_id);
            return;
        }

        // Calculate and set amount based on percentage
        const originalPrice = this.getOriginalPrice();
        const calculatedAmount = (originalPrice * dist_tag.percentage) / 100;
        dist_tag.amount = calculatedAmount;

        this.autoFill();
    },

    async onSelectProduct(option, params, tag) {
        if (option.action) {
            return option.action(tag);
        }
        const selected_option = Object.getPrototypeOf(option);
        tag.product_id = parseInt(selected_option.value);
        tag.analytic_product_name = selected_option.label;
        this.setFocusSelector(`.tag_${tag.id} .o_analytic_amount`);
        this.autoFill();
    },

    async amountChanged(dist_tag, ev) {
        const amount = this.parse(ev.target.value);
        dist_tag.amount = amount;
        
        if (amount === 0) {
            this.deleteTag(dist_tag.id, dist_tag.group_id);
            return;
        }

        // Calculate and set percentage based on amount
        const originalPrice = this.getOriginalPrice();
        const calculatedPercentage = this.calculatePercentageFromAmount(amount, originalPrice);
        dist_tag.percentage = calculatedPercentage;

        this.autoFill();
    },

    get extendedData() {
        let res = {};
        this.listReady.map(({analytic_account_id, percentage, product_id, amount}) => {
            res[parseInt(analytic_account_id)] = {
                percentage: percentage,
                product_id: product_id || false,
                amount: amount || 0
            };
        });
        return res;
    },

    newTag(group_id) {
        return {
            id: this.nextId++,
            group_id: group_id,
            analytic_account_id: null,
            analytic_account_name: "",
            analytic_product_name: "",
            product_id: null,
            amount: 0,
            percentage: this.remainderByGroup(group_id),
            color: this.list[group_id].color,
        }
    },

    async save() {
        const currentDistribution = this.listForJson;
        const extendedDistribution = this.extendedData;
        const serverDistribution = {};
        for (const [accountId, data] of Object.entries(currentDistribution)) {
            serverDistribution[accountId] = typeof data === 'object' ? data.percentage : data;
        }
        await this.props.record.update({
            analytic_distribution: serverDistribution,
            analytic_distribution_extended: extendedDistribution
        });
        // if (this.props.record.analytic_distribution_extended) {
        //     await this.props.record.update({
        //     }); 
        // }
        this.props.record.data.analytic_distribution = serverDistribution;
        this.props.record.data.analytic_distribution_extended = extendedDistribution;
    },

    calculatePercentageFromAmount(amount, originalPrice) {
        if (!originalPrice || originalPrice === 0) return 0;
        return (amount / originalPrice) * 100;
    },

    getOriginalPrice() {
        // Get the original price from the record
        // This could be price_unit, price_subtotal, or balance depending on your needs
        const record = this.props.record.data;
        return record.price_unit || record.price_subtotal || record.balance || 0;
    },
});

AnalyticDistribution.fieldDependencies = {
    analytic_precision: { type: 'integer' },
    analytic_distribution: { type: 'json' },
    analytic_distribution_extended: { type: 'json' },
}

AnalyticDistribution.props = {
    ...standardFieldProps,
    business_domain: { type: String, optional: true },
    account_field: { type: String, optional: true },
    product_field: { type: String, optional: true },
    business_domain_compute: { type: String, optional: true },
    force_applicability: { type: String, optional: true },
    allow_save: { type: Boolean },
    analytic_distribution_extended: { type: Object, optional: true },
}

AnalyticDistribution.extractProps = ({ field, attrs }) => {
    return {
        business_domain: attrs.options.business_domain,
        account_field: attrs.options.account_field,
        product_field: attrs.options.product_field,
        business_domain_compute: attrs.business_domain_compute,
        force_applicability: attrs.options.force_applicability,
        allow_save: !Boolean(attrs.options.disable_save),
        analytic_distribution_extended: attrs.options.analytic_distribution_extended,
    };
};
