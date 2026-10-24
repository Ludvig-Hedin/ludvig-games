# Color Clash rules

Color Clash uses an original 108-card deck: four colors, one zero per color, two of each 1–9, two Skips, two Reverses and two Draw Twos per color, plus four Wilds and four Wild Draw Fours. All random shuffles use cryptographic rejection sampling. Difficulty never changes the deck or outcomes.

## Default game

- Two to six players. Deal seven cards each. The first seat starts on a number card. An opening seven or zero never triggers a special effect.
- Play one card matching the active color, number or action symbol. A Wild may be played at any time. Choose one of the four colors when playing either Wild.
- Wild Draw Four is legal **only when your hand has no cards of the active color**. Having a matching number or symbol in a different color does not prevent it. The authoritative rules engine checks this, so there is no bluff/challenge variant.
- You may draw one card instead of playing, even if you have a legal card. If the new card is legal, you may play **only that card**, or pass. If it is not legal, your turn passes immediately. You cannot keep drawing until you find a match.
- Skip skips the next player. Reverse reverses the direction. In a two-player game Reverse acts as a Skip, giving the same player another turn.
- Draw Two and Wild Draw Four make the next player take two or four cards and lose their turn. They cannot defend with another draw card in the default rules. The UI asks them to take the penalty; a penalty on a winning card is paid immediately.
- Call **CLASH!** when you go down to one card. You may arm the call before playing, or call immediately afterward. Until the next player plays, draws or passes, another player may catch a missed call. Getting caught costs two cards and does not consume the catcher's turn. Once the next turn action starts, that catch window closes.
- The first empty hand wins immediately. A final Skip/Reverse still resolves; a final draw card makes the next player take its penalty before the round ends. There is no point-scoring subgame.
- If the draw pile runs out, shuffle every discard except the top card into a new draw pile. If there are no recyclable cards, drawing takes only the available cards and the game continues.

## Optional house rules

These are off by default and selected before starting a match.

| House rule | Exact effect |
| --- | --- |
| Draw stacking | Respond to +2 with another +2, or +4 with another +4. The penalty adds up and passes to the next player. Mixed +2/+4 stacks are not legal. A stacked +4 still requires no active-color card. Taking the accumulated penalty ends that player's turn. A final draw card ends the round; its full accumulated penalty is paid. |
| Jump-in | Any player can immediately play an exact match of the last **colored** card: same color and same number/symbol. Wilds cannot jump in. Jump-in cannot interrupt a pending draw penalty or the decision to play a newly drawn card. The jumper becomes the current player and the played card's normal effect resolves. |
| Seven–zero | A seven swaps your hand with a player you choose. A zero passes every hand to the next seat in the current direction. Transfers happen **before** checking victory: playing your final seven or zero gives the empty hand, and the win, to its recipient. Other players who receive a one-card hand are automatically announced; the acting player must still call CLASH if they receive one card. |
| Quick play | Start with five cards instead of seven. All other selected rules are unchanged. |

## AI and privacy

Easy chooses among legal cards with frequent strategic mistakes. Medium balances suits and special cards with imperfect choices. Hard manages hand composition, uses public opponent counts, chooses useful Wild colors and protects against imminent wins. Expert puts more weight on turn order, disruptive special cards, preserving flexible cards and the next turn's possibilities.

Every difficulty calls the same legal-action validator. Bots receive only their own hand, the public discard, active color, direction, public card counts, and public events. They never receive another hand or the deck order.
