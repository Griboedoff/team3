'use strict';

const sanitizeHtml = require('sanitize-html');
const extractMeta = require('../utils/metaExtractor');
const Reaction = require('./Reaction');
const mongoose = require('mongoose');

const mongoSchema = new mongoose.Schema({
    author: {
        type: String,
        ref: 'User',
        index: true
    },
    date: {
        type: Date,
        default: Date.now,
        index: true
    },
    text: String,
    meta: {},
    reactions: [Reaction.schema],
    attachments: [String]
}, { minimize: false });

class MessageClass {
    static async initialize({ author, text, attachments }) {
        const meta = await extractMeta(text);

        return {
            _id: mongoose.Types.ObjectId(),
            author,
            meta,
            data: Date.now(),
            text: processMarkdownAndSanitize(text),
            reactions: [],
            attachments: attachments || []
        };
    }
}

function processMarkdownAndSanitize(text) {
    return sanitizeHtml(text, {
        allowedTags: ['p', 'strong', 'em', 'a', 'code'],
        allowedAttributes: {
            'a': ['href']
        }
    });
}

mongoSchema.loadClass(MessageClass);
const Message = mongoose.model('Message', mongoSchema);

module.exports = Message;
