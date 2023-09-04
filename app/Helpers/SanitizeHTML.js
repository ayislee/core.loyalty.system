"use strict";

const cheerio = require("cheerio");
const sanitize = require("sanitize-html");

module.exports = html => {
	//validation
	if (!html) return "";

	//sanitize the HTML first
	const content = sanitize(html, {
		allowedTags: false,
		allowedAttributes: false,
		allowedSchemesByTag: {
			img: ["http", "https", "data", "cid"]
		}
	});

	//3rd argument is isDocument. If you set this to false, your document will be parsed in fragment mode and no <html> root tag (or other boilerplate) will be inserted
	const isDocument = /<html/i.test(html); //check the string whether contains "<html"
	const $ = cheerio.load(content, null, isDocument);

	//remove script tags
	$("script").remove();
	$('link[as="script"]').remove();
	$("link[href]").remove();

	//check all attributes which may contain javascript
	const elements = $("*");

	for (const iterator of elements) {
		const current = $(iterator);
		const attributes = Object.keys(iterator.attribs);
		const x_attributes_prefix = Object.keys(iterator["x-attribsPrefix"]);

		//remove "xlink:href" attribute
		if (x_attributes_prefix[0] === "href" && iterator["x-attribsPrefix"][x_attributes_prefix] === "xlink") current.removeAttr("href");

		//read all the attributes and remove them should they match the regex
		for (const attr of attributes) {
			//remove on attribute (eg. onClick)
			if (/^on/i.test(attr)) current.removeAttr(attr);

			//remove action attribute (eg. form)
			if (/^action/i.test(attr)) current.removeAttr(attr);
		}
	}

	return $.html();
};
