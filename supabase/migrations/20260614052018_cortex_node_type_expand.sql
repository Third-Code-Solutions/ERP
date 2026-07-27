-- Expand the Cortex node-type taxonomy to cover the whole ERP. Additive.
alter type cortex_node_type add value if not exists 'contact';
alter type cortex_node_type add value if not exists 'permit';
alter type cortex_node_type add value if not exists 'claim';
alter type cortex_node_type add value if not exists 'ticket';
alter type cortex_node_type add value if not exists 'delivery';
alter type cortex_node_type add value if not exists 'rfq';
alter type cortex_node_type add value if not exists 'contract';
alter type cortex_node_type add value if not exists 'certificate';
alter type cortex_node_type add value if not exists 'punchlist';
alter type cortex_node_type add value if not exists 'inspection';
alter type cortex_node_type add value if not exists 'design';
alter type cortex_node_type add value if not exists 'change_request';
alter type cortex_node_type add value if not exists 'material';
alter type cortex_node_type add value if not exists 'weekly_report';;
